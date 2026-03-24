import { useEffect, useState } from 'react'
import { Clock, User, Tag } from 'lucide-react'
import { getSessions, type Session } from '../lib/api'
import { formatDate } from '../lib/utils'

function SessionRow({ session }: { session: Session }) {
  return (
    <div className="flex items-center justify-between p-4 bg-surface border border-border rounded-xl hover:border-primary/30 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text mb-1">{session.title}</p>
        <div className="flex items-center gap-4 flex-wrap">
          {session.speaker && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <User size={11} />
              {session.speaker}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Clock size={11} />
            {formatDate(session.created_at)}
          </span>
          <span className="flex items-center gap-1 text-xs text-text-subtle">
            <Tag size={11} />
            {session.session_type}
          </span>
        </div>
      </div>
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
          session.status === 'active'
            ? 'border-success/30 text-success bg-success/10'
            : 'border-border text-text-subtle'
        }`}
      >
        {session.status === 'active' ? '진행 중' : '완료'}
      </span>
    </div>
  )
}

export function SessionHistory() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '세션을 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-lg font-semibold text-text mb-8">세션 기록</h1>

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 bg-surface border border-border rounded-xl animate-pulse"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="p-4 bg-error/10 border border-error/20 rounded-xl text-sm text-error">
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="text-center py-20 border border-border border-dashed rounded-xl">
            <p className="text-text-muted text-sm">세션 기록이 없습니다.</p>
            <p className="text-text-subtle text-xs mt-1">
              첫 세션을 시작해보세요.
            </p>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-text-subtle mb-4">
              총 {sessions.length}개의 세션
            </p>
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
