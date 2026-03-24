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
  const store = useAppStore()
  const storeRef = useRef(store)

  useEffect(() => {
    storeRef.current = store
  })

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

      const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`)
      wsRef.current = ws
      storeRef.current.setWsStatus('connecting')

      ws.onopen = () => {
        if (!isMounted) return
        storeRef.current.setWsStatus('connected')

        // Send session_start after connection
        const s = storeRef.current
        ws.send(
          JSON.stringify({
            type: 'session_start',
            title: s.sessionTitle,
            speaker: s.sessionSpeaker,
            session_type: s.sessionType,
            group: s.sessionGroup,
            api_key: s.settings.apiKey,
            provider: s.settings.provider,
            model: s.settings.model || undefined,
            obsidian_path: s.settings.obsidianPath,
          })
        )
        storeRef.current.startSession()
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
                storeRef.current.updateLastMessage(text)
              } else {
                // Final message — mark streaming as done
                const messages = storeRef.current.messages
                const last = messages[messages.length - 1]
                if (last?.role === 'assistant' && last.streaming) {
                  storeRef.current.updateLastMessage(text)
                  // Mark as not streaming
                  useAppStore.setState((state) => {
                    const msgs = [...state.messages]
                    if (msgs.length > 0) {
                      msgs[msgs.length - 1] = {
                        ...msgs[msgs.length - 1],
                        streaming: false,
                      }
                    }
                    return { messages: msgs }
                  })
                } else {
                  storeRef.current.addMessage({
                    role: 'assistant',
                    text,
                    timestamp: new Date().toISOString(),
                    streaming: false,
                  })
                }
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
        storeRef.current.setWsStatus('disconnected')
        wsRef.current = null

        // Reconnect if session is still active
        const status = storeRef.current.sessionStatus
        if (status === 'active' || status === 'starting') {
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
