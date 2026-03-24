import { useEffect, useState } from 'react'
import { Clock, User, Tag } from 'lucide-react'
import { getSessions, type Session } from '../lib/api'
import { formatDate } from '../lib/utils'

const PALETTE = [
  { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-400' },
  { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-400' },
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-400' },
  { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30', dot: 'bg-pink-400' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-400' },
]

function getGroupPalette(group: string) {
  if (!group) return PALETTE[0]
  let h = 0
  for (const c of group) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return PALETTE[h % PALETTE.length]
}

function groupSessionsByDate(sessions: Session[]): { dateLabel: string; sessions: Session[] }[] {
  const map = new Map<string, Session[]>()
  for (const s of sessions) {
    const raw = s.started_at || s.created_at || ''
    const dateKey = raw ? raw.slice(0, 10) : '날짜 없음'
    if (!map.has(dateKey)) map.set(dateKey, [])
    map.get(dateKey)!.push(s)
  }
  const sorted = Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  return sorted.map(([dateKey, list]) => ({
    dateLabel: dateKey === '날짜 없음' ? dateKey : formatDateLabel(dateKey),
    sessions: list,
  }))
}

function formatDateLabel(dateKey: string): string {
  const d = new Date(dateKey)
  if (isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

function GroupBadge({ group }: { group: string }) {
  if (!group) return null
  const p = getGroupPalette(group)
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${p.bg} ${p.text} ${p.border}`}>
      {group}
    </span>
  )
}

function SessionRow({ session }: { session: Session }) {
  return (
    <div className="flex items-center justify-between p-4 bg-surface border border-border rounded-xl hover:border-primary/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className="text-sm font-medium text-text">{session.title}</p>
          {session.group && <GroupBadge group={session.group} />}
        </div>
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
        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ml-3 ${
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
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '세션을 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [])

  const allGroups = Array.from(new Set(sessions.map((s) => s.group).filter(Boolean))).sort()

  const filtered = activeGroup ? sessions.filter((s) => s.group === activeGroup) : sessions

  const grouped = groupSessionsByDate(filtered)

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-lg font-semibold text-text mb-6">세션 기록</h1>

        {/* Group filter chips */}
        {allGroups.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            <button
              onClick={() => setActiveGroup(null)}
              className={`px-3 py-1.5 rounded-full text-xs border font-medium transition-colors ${
                activeGroup === null
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-text-muted hover:border-primary/40 hover:text-text'
              }`}
            >
              전체
            </button>
            {allGroups.map((g) => {
              const p = getGroupPalette(g)
              const isActive = activeGroup === g
              return (
                <button
                  key={g}
                  onClick={() => setActiveGroup(isActive ? null : g)}
                  className={`px-3 py-1.5 rounded-full text-xs border font-medium transition-colors ${
                    isActive ? `${p.bg} ${p.text} ${p.border}` : 'border-border text-text-muted hover:border-primary/40 hover:text-text'
                  }`}
                >
                  {g}
                </button>
              )
            })}
          </div>
        )}

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
          <div className="space-y-6">
            <p className="text-xs text-text-subtle">
              총 {filtered.length}개의 세션{activeGroup ? ` (${activeGroup})` : ''}
            </p>
            {grouped.map(({ dateLabel, sessions: daySessions }) => (
              <div key={dateLabel}>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  {dateLabel}
                </p>
                <div className="space-y-2">
                  {daySessions.map((s) => (
                    <SessionRow key={s.id} session={s} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
