import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'

interface SendMessage {
  type: string
  [key: string]: unknown
}

interface UseWebSocketReturn {
  send: (msg: SendMessage) => void
  isConnected: boolean
}

export function useWebSocket(sessionId: string | null): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track whether session_start has already been sent — don't repeat on reconnect
  const sessionStartedRef = useRef(false)
  const store = useAppStore()
  const storeRef = useRef(store)

  useEffect(() => {
    storeRef.current = store
  })

  // Reset the flag whenever sessionId changes (new session)
  useEffect(() => {
    sessionStartedRef.current = false
  }, [sessionId])

  const send = useCallback((msg: SendMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  useEffect(() => {
    if (!sessionId) return

    let isMounted = true

    const connect = () => {
      if (!isMounted) return

      const ws = new WebSocket(`ws://localhost:8001/ws/${sessionId}`)
      wsRef.current = ws
      storeRef.current.setWsStatus('connecting')

      ws.onopen = () => {
        if (!isMounted) return
        storeRef.current.setWsStatus('connected')

        // Always send session_start so backend can (re)initialise the agent.
        // Backend skips session creation if the session already exists.
        const s = storeRef.current
        ws.send(
          JSON.stringify({
            type: 'session_start',
            title: s.sessionTitle,
            speaker: s.sessionSpeaker,
            session_type: s.sessionType,
            group: s.sessionGroup,
            session_date: s.sessionDate,
            api_key: s.settings.apiKey,
            provider: s.settings.provider,
            model: s.settings.model || undefined,
            obsidian_path: s.settings.obsidianPath,
          })
        )

        // Only reset frontend state on the very first connection
        if (!sessionStartedRef.current) {
          sessionStartedRef.current = true
          storeRef.current.startSession()
        }
      }

      ws.onmessage = (event: MessageEvent) => {
        if (!isMounted) return
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>
          const type = data.type as string

          switch (type) {
            case 'status':
              storeRef.current.setAgentStatus(data.message as string)
              break

            case 'concept_update':
              storeRef.current.addConcepts(
                data.concepts as { name: string; definition: string }[]
              )
              break

            case 'agent_response': {
              const text = data.text as string
              const streaming = data.streaming as boolean
              if (streaming) {
                // text is the full accumulated answer so far — replace in place
                storeRef.current.updateLastMessage(text)
              } else {
                // Stream ended — just clear the streaming flag, keep the text
                useAppStore.setState((state) => {
                  const msgs = [...state.messages]
                  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
                    msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], streaming: false }
                  } else if (text) {
                    // Edge case: no streaming messages yet, add directly
                    msgs.push({ role: 'assistant', text, timestamp: new Date().toISOString(), streaming: false })
                  }
                  return { messages: msgs }
                })
              }
              break
            }

            case 'session_summary':
              storeRef.current.setSummary(
                data.data as Parameters<typeof storeRef.current.setSummary>[0]
              )
              break

            case 'obsidian_saved':
              storeRef.current.setObsidianSaved(data.path as string)
              break

            case 'session_restored': {
              // 이어 녹음: 이전 전사 + 개념 복원
              const transcript = data.transcript as string
              const concepts = data.concepts as { name: string; definition: string; first_seen?: string }[]
              storeRef.current.restoreSession(transcript, concepts)
              break
            }

            case 'agent_proactive':
              storeRef.current.addMessage({
                role: 'assistant',
                text: data.text as string,
                timestamp: new Date().toISOString(),
                streaming: false,
                proactive: true,
                confusion: !!(data.is_confusion),
              })
              break

            case 'confusion_noted':
              storeRef.current.addMessage({
                role: 'assistant',
                text: `혼동 포인트로 기록했습니다: "${data.description as string}"`,
                timestamp: new Date().toISOString(),
                streaming: false,
                proactive: true,
                confusion: true,
              })
              break

            case 'keyword_added':
              storeRef.current.setKeywords(data.keywords as string[])
              break

            case 'understanding_feedback':
              storeRef.current.addMessage({
                role: 'assistant',
                text: data.message as string,
                timestamp: new Date().toISOString(),
                streaming: false,
                proactive: true,
              })
              break

            case 'error':
              storeRef.current.setAgentStatus(`오류: ${data.message as string}`)
              break

            default:
              break
          }
        } catch (err) {
          console.error('WS parse error', err)
        }
      }

      ws.onerror = () => {
        if (!isMounted) return
        storeRef.current.setWsStatus('error')
      }

      ws.onclose = () => {
        if (!isMounted) return
        // Ignore close events from a superseded WS instance (StrictMode double-invoke)
        if (wsRef.current !== ws && wsRef.current !== null) return
        storeRef.current.setWsStatus('disconnected')
        wsRef.current = null

        // Retry as long as the session hasn't finished.
        // This covers both initial failures (status='idle') and mid-session drops.
        const status = storeRef.current.sessionStatus
        if (status !== 'ended' && status !== 'ending') {
          reconnectTimerRef.current = setTimeout(() => {
            if (isMounted) connect()
          }, 2000)
        }
      }
    }

    connect()

    return () => {
      isMounted = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [sessionId])

  const isConnected =
    wsRef.current?.readyState === WebSocket.OPEN

  return { send, isConnected }
}
