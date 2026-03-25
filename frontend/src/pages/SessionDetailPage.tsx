import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  User,
  Calendar,
  Tag,
  Clock,
  BookOpen,
  MessageSquare,
  FileText,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Play,
} from 'lucide-react'
import { getSession, type Session } from '../lib/api'
import { useAppStore } from '../store/appStore'
import { cn, formatDate } from '../lib/utils'

// ─── helpers ─────────────────────────────────────────────────────────────────

function duration(started: string, ended?: string): string {
  const start = new Date(started)
  const end = ended ? new Date(ended) : new Date()
  const mins = Math.round((end.getTime() - start.getTime()) / 60000)
  if (mins < 60) return `${mins}분`
  return `${Math.floor(mins / 60)}시간 ${mins % 60}분`
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string
  icon: React.ElementType
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-text-muted" />
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-xs text-text-subtle">({count})</span>
        )}
      </div>
      {children}
    </section>
  )
}

// ─── Q&A item ────────────────────────────────────────────────────────────────

function QAItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-text hover:bg-surface-elevated transition-colors text-left gap-3"
      >
        <span className="flex-1">{question}</span>
        {open ? <ChevronUp size={14} className="shrink-0 text-text-subtle" /> : <ChevronDown size={14} className="shrink-0 text-text-subtle" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border bg-surface-elevated">
          <p className="text-sm text-text-muted leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setSessionId, setSessionInfo, resetSession, restoreSession } = useAppStore()

  const handleResume = (s: Session) => {
    resetSession()
    setSessionInfo(s.title, s.speaker, s.session_type, s.group ?? '', s.session_date ?? '')
    setSessionId(s.id)
    // Restore previously recorded transcript and concepts so they show up immediately
    restoreSession(
      s.transcript ?? '',
      s.concepts ?? [],
    )
    navigate('/session')
  }

  useEffect(() => {
    if (!id) return
    getSession(id)
      .then(setSession)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : '세션을 불러오지 못했습니다.')
      )
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="space-y-2 w-80">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle size={32} className="text-error" />
        <p className="text-sm text-text-muted">{error ?? '세션을 찾을 수 없습니다.'}</p>
        <button
          onClick={() => navigate('/history')}
          className="text-xs text-primary hover:underline"
        >
          목록으로 돌아가기
        </button>
      </div>
    )
  }

  const isEnded = session.status === 'ended'

  return (
    <div className="h-full overflow-y-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={14} />
          뒤로
        </button>
        <span className="text-border">|</span>
        <span className="text-sm font-semibold text-text truncate flex-1">{session.title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border font-medium',
              isEnded
                ? 'border-border text-text-subtle'
                : 'border-success/30 text-success bg-success/10'
            )}
          >
            {isEnded ? '완료' : '진행 중'}
          </span>
          <button
            onClick={() => handleResume(session)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Play size={11} />
            {isEnded ? '이어 녹음' : '이어하기'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Meta */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 mb-8 text-xs text-text-muted">
          {session.speaker && (
            <span className="flex items-center gap-1.5">
              <User size={12} />
              {session.speaker}
            </span>
          )}
          {session.group && (
            <span className="flex items-center gap-1.5">
              <Tag size={12} />
              {session.group}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar size={12} />
            {formatDate(session.session_date || session.started_at)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={12} />
            {duration(session.started_at, session.ended_at)}
          </span>
          <span className="flex items-center gap-1.5">
            <BookOpen size={12} />
            {session.session_type}
          </span>
        </div>

        {/* Summary */}
        {session.summary && (
          <Section title="요약" icon={Lightbulb}>
            <div className="p-4 bg-surface border border-border rounded-xl">
              <p className="text-sm text-text leading-relaxed">{session.summary.summary}</p>
            </div>

            {session.summary.key_concepts.length > 0 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {session.summary.key_concepts.map((c) => (
                  <div key={c.name} className="p-3 bg-surface border border-border rounded-xl">
                    <p className="text-xs font-semibold text-primary mb-1">{c.name}</p>
                    <p className="text-xs text-text-muted leading-relaxed">{c.definition}</p>
                  </div>
                ))}
              </div>
            )}

            {session.summary.unclear_points.length > 0 && (
              <div className="mt-3 p-3 bg-warning/5 border border-warning/20 rounded-xl">
                <p className="text-xs font-semibold text-warning mb-2">불명확한 부분</p>
                <ul className="space-y-1">
                  {session.summary.unclear_points.map((pt, i) => (
                    <li key={i} className="text-xs text-text-muted flex gap-2">
                      <span className="text-warning shrink-0">·</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {session.summary.review_questions.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-text-muted mb-2">복습 문제</p>
                {session.summary.review_questions.map((rq, i) => (
                  <QAItem key={i} question={rq.question} answer={rq.answer} />
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Transcript */}
        {session.transcript && (
          <Section title="전사" icon={FileText}>
            <div className="p-4 bg-surface border border-border rounded-xl max-h-64 overflow-y-auto">
              <p className="font-mono text-sm text-text leading-relaxed whitespace-pre-wrap">
                {session.transcript}
              </p>
            </div>
          </Section>
        )}

        {/* Concepts */}
        {session.concepts && session.concepts.length > 0 && (
          <Section title="추출된 개념" icon={Lightbulb} count={session.concepts.length}>
            <div className="flex flex-wrap gap-2">
              {session.concepts.map((c) => (
                <div
                  key={c.name}
                  className="group relative px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg cursor-default"
                >
                  <span className="text-xs font-medium text-primary">{c.name}</span>
                  {c.definition && (
                    <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 w-64 p-3 bg-surface-elevated border border-border rounded-xl shadow-xl text-xs text-text-muted leading-relaxed">
                      {c.definition}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Q&A during session */}
        {session.user_questions && session.user_questions.length > 0 && (
          <Section title="세션 중 Q&A" icon={MessageSquare} count={session.user_questions.length}>
            <div className="space-y-2">
              {session.user_questions.map((qa, i) => (
                <QAItem key={i} question={qa.question} answer={qa.answer} />
              ))}
            </div>
          </Section>
        )}

        {/* Confusion points */}
        {session.confusion_points && session.confusion_points.length > 0 && (
          <Section title="혼동 포인트" icon={AlertCircle} count={session.confusion_points.length}>
            <ul className="space-y-1.5">
              {session.confusion_points.map((pt, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-text-muted p-3 bg-surface border border-border rounded-lg"
                >
                  <span className="text-warning mt-0.5 shrink-0">·</span>
                  {pt}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Empty state */}
        {!session.transcript && !session.summary &&
          (!session.concepts || session.concepts.length === 0) && (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <p className="text-sm text-text-muted">세션 내용이 없습니다.</p>
            <p className="text-xs text-text-subtle mt-1">
              세션 중 녹음된 내용이 없거나 아직 처리 중입니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
