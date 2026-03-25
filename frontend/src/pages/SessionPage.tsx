import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mic,
  MicOff,
  Square,
  Send,
  ChevronDown,
  ChevronUp,
  BookMarked,
  Plus,
} from 'lucide-react'
import { useAppStore, type Concept } from '../store/appStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { cn, formatTime } from '../lib/utils'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtElapsed(seconds: number): string {
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Live Transcript Panel ───────────────────────────────────────────────────

function LiveTranscriptPanel() {
  const chunks = useAppStore((s) => s.transcriptChunks)
  const interimTranscript = useAppStore((s) => s.interimTranscript)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chunks, interimTranscript])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          실시간 자막
        </span>
        {chunks.length > 0 && (
          <span className="text-xs text-text-subtle">{chunks.length}문장</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
        {chunks.length === 0 && !interimTranscript && (
          <p className="text-text-subtle text-sm italic">
            녹음을 시작하면 자막이 여기에 표시됩니다...
          </p>
        )}

        {chunks.map((chunk, i) => (
          <div key={i} className="flex gap-3">
            <span className={cn(
              'text-[11px] font-mono shrink-0 pt-0.5 w-10 text-right tabular-nums',
              chunk.restored ? 'text-text-subtle' : 'text-primary/60'
            )}>
              {chunk.restored ? '–' : fmtElapsed(chunk.elapsed)}
            </span>
            <p className={cn(
              'text-sm leading-relaxed break-words flex-1',
              chunk.restored ? 'text-text-subtle italic' : 'text-text'
            )}>
              {chunk.text}
            </p>
          </div>
        ))}

        {interimTranscript && (
          <div className="flex gap-3">
            <span className="text-[11px] font-mono shrink-0 pt-0.5 w-10 text-right text-text-subtle">
              ···
            </span>
            <p className="text-sm leading-relaxed text-text-muted italic flex-1 streaming-cursor">
              {interimTranscript}
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ─── Chat Panel ──────────────────────────────────────────────────────────────

function MessageBubble({ role, text, timestamp, streaming }: {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  streaming?: boolean
}) {
  const isUser = role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-white rounded-br-sm'
            : 'bg-surface-elevated border border-border text-text rounded-bl-sm'
        )}
      >
        <p className={cn('whitespace-pre-wrap', streaming && 'streaming-cursor')}>
          {text}
        </p>
        <p
          className={cn(
            'text-[10px] mt-1',
            isUser ? 'text-white/60 text-right' : 'text-text-subtle'
          )}
        >
          {formatTime(timestamp)}
        </p>
      </div>
    </div>
  )
}

function ChatPanel({ send }: { send: (msg: Record<string, unknown>) => void }) {
  const messages = useAppStore((s) => s.messages)
  const addMessage = useAppStore((s) => s.addMessage)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    addMessage({ role: 'user', text, timestamp: new Date().toISOString() })
    send({ type: 'question', text })
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Q&A
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-text-subtle text-sm italic text-center mt-8">
            궁금한 점을 질문하거나, 이해도를 체크해보세요.
          </p>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} {...msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문 입력... (Enter로 전송)"
            rows={2}
            className="flex-1 bg-surface-elevated border border-border rounded-xl px-3 py-2 text-sm text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 resize-none transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Concepts Panel ───────────────────────────────────────────────────────────

function ConceptPill({ concept }: { concept: Concept }) {
  const [showDef, setShowDef] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setShowDef((v) => !v)}
        className="px-2.5 py-1 rounded-full text-xs border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
      >
        {concept.name}
      </button>
      {showDef && (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-surface-elevated border border-border rounded-xl p-3 shadow-xl z-10">
          <p className="text-xs font-semibold text-text mb-1">{concept.name}</p>
          <p className="text-xs text-text-muted leading-relaxed">
            {concept.definition}
          </p>
        </div>
      )}
    </div>
  )
}

function ConceptsPanel() {
  const concepts = useAppStore((s) => s.concepts)
  const agentStatus = useAppStore((s) => s.agentStatus)
  const wsStatus = useAppStore((s) => s.wsStatus)

  const wsColor =
    wsStatus === 'connected'
      ? 'bg-success'
      : wsStatus === 'connecting'
      ? 'bg-warning'
      : wsStatus === 'error'
      ? 'bg-error'
      : 'bg-text-subtle'

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          개념 & 상태
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Agent status */}
        <div>
          <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">
            에이전트 상태
          </p>
          {agentStatus ? (
            <p className="text-xs text-text-muted leading-relaxed">{agentStatus}</p>
          ) : (
            <p className="text-xs text-text-subtle italic">대기 중...</p>
          )}
        </div>

        {/* Concepts */}
        <div>
          <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">
            추출된 개념 ({concepts.length})
          </p>
          {concepts.length === 0 ? (
            <p className="text-xs text-text-subtle italic">
              세션 중 개념이 자동 추출됩니다.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {concepts.map((c) => (
                <ConceptPill key={c.name} concept={c} />
              ))}
            </div>
          )}
        </div>

        {/* WS status */}
        <div className="mt-auto">
          <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">
            연결 상태
          </p>
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full', wsColor)} />
            <span className="text-xs text-text-muted capitalize">{wsStatus}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Session Summary View ─────────────────────────────────────────────────────

function ReviewQuestion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-text hover:bg-surface-elevated transition-colors text-left"
      >
        <span>{question}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          <p className="text-sm text-text-muted leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}

function SessionSummaryView({ onNewSession }: { onNewSession: () => void }) {
  const summary = useAppStore((s) => s.summary)
  const obsidianPath = useAppStore((s) => s.obsidianPath)
  const sessionTitle = useAppStore((s) => s.sessionTitle)

  if (!summary) return null

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-text mb-1">세션 완료</h1>
            <p className="text-sm text-text-muted">{sessionTitle}</p>
          </div>
          <button
            onClick={onNewSession}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            새 세션
          </button>
        </div>

        {/* Summary */}
        <section className="mb-6 p-5 bg-surface border border-border rounded-xl">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            요약
          </h2>
          <p className="text-sm text-text leading-relaxed">{summary.summary}</p>
        </section>

        {/* Key Concepts */}
        {summary.key_concepts.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              핵심 개념
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summary.key_concepts.map((c) => (
                <div
                  key={c.name}
                  className="p-4 bg-surface border border-border rounded-xl"
                >
                  <p className="text-sm font-semibold text-primary mb-1">
                    {c.name}
                  </p>
                  <p className="text-xs text-text-muted leading-relaxed">
                    {c.definition}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Unclear Points */}
        {summary.unclear_points.length > 0 && (
          <section className="mb-6 p-5 bg-surface border border-warning/20 rounded-xl">
            <h2 className="text-xs font-semibold text-warning uppercase tracking-wider mb-3">
              불명확한 부분
            </h2>
            <ul className="space-y-1.5">
              {summary.unclear_points.map((p, i) => (
                <li key={i} className="text-sm text-text-muted flex items-start gap-2">
                  <span className="text-warning mt-0.5">•</span>
                  {p}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Review Questions */}
        {summary.review_questions.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              복습 질문
            </h2>
            <div className="space-y-2">
              {summary.review_questions.map((q, i) => (
                <ReviewQuestion key={i} question={q.question} answer={q.answer} />
              ))}
            </div>
          </section>
        )}

        {/* Obsidian path */}
        {obsidianPath && (
          <div className="flex items-center gap-2 p-4 bg-surface border border-success/20 rounded-xl">
            <BookMarked size={16} className="text-success shrink-0" />
            <div>
              <p className="text-xs font-semibold text-success">Obsidian에 저장됨</p>
              <p className="text-xs text-text-muted font-mono mt-0.5">{obsidianPath}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Bottom Bar ───────────────────────────────────────────────────────────────

function BottomBar({
  isListening,
  isSupported,
  onToggleMic,
  send,
}: {
  isListening: boolean
  isSupported: boolean
  onToggleMic: () => void
  send: (msg: Record<string, unknown>) => void
}) {
  const understandingLevels = [
    { level: 3, label: '이해됨', emoji: '😊', color: 'text-success border-success/30 hover:bg-success/10' },
    { level: 2, label: '애매함', emoji: '😐', color: 'text-warning border-warning/30 hover:bg-warning/10' },
    { level: 1, label: '모르겠음', emoji: '😕', color: 'text-error border-error/30 hover:bg-error/10' },
  ]

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-border bg-surface shrink-0">
      {/* Mic button */}
      <button
        onClick={onToggleMic}
        disabled={!isSupported}
        title={isSupported ? (isListening ? '녹음 중지' : '녹음 시작') : '음성 인식 미지원'}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors',
          isListening
            ? 'bg-error/15 border-error/40 text-error'
            : 'bg-surface-elevated border-border text-text-muted hover:text-text hover:border-primary/40',
          !isSupported && 'opacity-40 cursor-not-allowed'
        )}
      >
        {isListening ? (
          <>
            <span className="recording-dot w-2 h-2 rounded-full bg-error" />
            <MicOff size={15} />
            녹음 중지
          </>
        ) : (
          <>
            <Mic size={15} />
            녹음 시작
          </>
        )}
      </button>

      <div className="h-5 w-px bg-border" />

      {/* Understanding check */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-text-subtle mr-1">이해도:</span>
        {understandingLevels.map(({ level, label, emoji, color }) => (
          <button
            key={level}
            onClick={() => send({ type: 'understanding_check', level })}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border transition-colors',
              color
            )}
            title={label}
          >
            <span>{emoji}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Session Page ────────────────────────────────────────────────────────

export function SessionPage() {
  const navigate = useNavigate()
  const sessionId = useAppStore((s) => s.sessionId)
  const sessionStatus = useAppStore((s) => s.sessionStatus)
  const sessionTitle = useAppStore((s) => s.sessionTitle)
  const sessionSpeaker = useAppStore((s) => s.sessionSpeaker)
  const appendTranscript = useAppStore((s) => s.appendTranscript)
  const endSession = useAppStore((s) => s.endSession)
  const resetSession = useAppStore((s) => s.resetSession)
  const settings = useAppStore((s) => s.settings)

  const { send } = useWebSocket(sessionId)

  const [micEnabled, setMicEnabled] = useState(false)

  const { isListening, isSupported, start, stop, error } = useSpeechRecognition({
    onTranscript: (text, isFinal) => {
      appendTranscript(text, isFinal)
      if (isFinal) {
        send({ type: 'transcript', text, is_final: true })
      }
    },
    language: settings.language === 'ko' ? 'ko-KR' : 'en-US',
    enabled: micEnabled,
  })

  // Redirect to home if no session
  useEffect(() => {
    if (!sessionId && sessionStatus === 'idle') {
      navigate('/')
    }
  }, [sessionId, sessionStatus, navigate])

  const handleToggleMic = () => {
    if (isListening) {
      stop()
      setMicEnabled(false)
    } else {
      setMicEnabled(true)
      start()
    }
  }

  const handleEndSession = () => {
    stop()
    setMicEnabled(false)
    endSession()
    send({ type: 'session_end' })
  }

  const handleNewSession = () => {
    resetSession()
    navigate('/')
  }

  if (sessionStatus === 'ended') {
    return <SessionSummaryView onNewSession={handleNewSession} />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          {sessionStatus === 'active' && (
            <div className="flex items-center gap-1.5">
              <span className="recording-dot w-2 h-2 rounded-full bg-error" />
              <span className="text-xs text-error font-semibold">REC</span>
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-text leading-none">
              {sessionTitle || '새 세션'}
            </p>
            {sessionSpeaker && (
              <p className="text-xs text-text-muted mt-0.5">{sessionSpeaker}</p>
            )}
          </div>
        </div>

        <button
          onClick={handleEndSession}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-error/30 text-error hover:bg-error/10 rounded-lg text-xs font-medium transition-colors"
        >
          <Square size={12} />
          세션 종료
        </button>
      </header>

      {/* Browser support warning */}
      {!isSupported && (
        <div className="px-5 py-2 bg-warning/10 border-b border-warning/20 text-xs text-warning">
          ⚠️ 이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-5 py-2 bg-error/10 border-b border-error/20 text-xs text-error">
          {error}
        </div>
      )}

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden divide-x divide-border">
        {/* Transcript */}
        <div className="w-[32%] overflow-hidden">
          <LiveTranscriptPanel />
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <ChatPanel send={send as (msg: Record<string, unknown>) => void} />
        </div>

        {/* Concepts */}
        <div className="w-[260px] overflow-hidden">
          <ConceptsPanel />
        </div>
      </div>

      {/* Bottom bar */}
      <BottomBar
        isListening={isListening}
        isSupported={isSupported}
        onToggleMic={handleToggleMic}
        send={send as (msg: Record<string, unknown>) => void}
      />
    </div>
  )
}
