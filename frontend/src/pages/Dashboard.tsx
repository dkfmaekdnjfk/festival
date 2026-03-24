import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, ChevronRight, Clock, User } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { getSessions, getGroups, type Session } from '../lib/api'
import { formatDate, truncate } from '../lib/utils'

const SESSION_TYPES = ['수업', '세미나', '학회', '강연']

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function StartSessionModal({
  onClose,
  onStart,
  initialDate,
}: {
  onClose: () => void
  onStart: (title: string, speaker: string, type: string, group: string, date: string) => void
  initialDate?: string
}) {
  const { settings } = useAppStore()
  const [title, setTitle] = useState('')
  const [speaker, setSpeaker] = useState('')
  const [sessionType, setSessionType] = useState(settings.defaultSessionType || '수업')
  const [group, setGroup] = useState('')
  const [existingGroups, setExistingGroups] = useState<string[]>([])
  const [date, setDate] = useState(initialDate ?? todayStr())

  useEffect(() => {
    getGroups()
      .then(setExistingGroups)
      .catch(() => setExistingGroups([]))
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onStart(title.trim(), speaker.trim(), sessionType, group.trim(), date)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-sm font-semibold text-text">새 세션 시작</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs text-text-muted mb-1.5 block">제목 *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 기계학습 3강 — 신경망"
              autoFocus
              className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 transition-colors"
            />
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1.5 block">발표자 / 강사</span>
            <input
              type="text"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="예: 김교수"
              className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 transition-colors"
            />
          </label>

          <div className="block">
            <span className="text-xs text-text-muted mb-1.5 block">그룹 / 과목</span>
            <input
              type="text"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="예: 기계학습, 운영체제"
              className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 transition-colors"
            />
            {existingGroups.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {existingGroups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroup(g)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      group === g
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border text-text-muted hover:border-primary/40 hover:text-text'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date picker */}
          <div className="block">
            <span className="text-xs text-text-muted mb-1.5 block">날짜</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDate(todayStr())}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  date === todayStr()
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-text-muted hover:border-primary/40 hover:text-text'
                }`}
              >
                오늘
              </button>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-text-muted mb-1.5 block">세션 유형</span>
            <div className="flex gap-2 flex-wrap">
              {SESSION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSessionType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    sessionType === t
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-text-muted hover:border-primary/40 hover:text-text'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </label>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm text-text-muted hover:text-text hover:border-primary/40 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              시작
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SessionCard({ session }: { session: Session }) {
  return (
    <div className="flex items-center justify-between p-4 bg-surface border border-border rounded-xl hover:border-primary/40 transition-colors group cursor-pointer">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">
          {session.title}
        </p>
        <div className="flex items-center gap-3 mt-1">
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
          <span className="text-xs text-text-subtle">{session.session_type}</span>
        </div>
      </div>
      <ChevronRight
        size={16}
        className="text-text-subtle group-hover:text-text-muted transition-colors shrink-0 ml-3"
      />
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { setSessionInfo, setSessionId, resetSession } = useAppStore()
  const [showModal, setShowModal] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    getSessions()
      .then((data) => setSessions(data.slice(0, 5)))
      .catch(() => setSessions([]))
      .finally(() => setLoadingHistory(false))
  }, [])

  const handleStart = (title: string, speaker: string, type: string, group: string, date: string) => {
    resetSession()
    setSessionInfo(title, speaker, type, group, date)
    // Generate a temporary session ID — backend will assign the real one via WS
    const tempId = `session_${Date.now()}`
    setSessionId(tempId)
    setShowModal(false)
    navigate('/session')
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        {/* Hero */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-text tracking-tight mb-2">
            festival
          </h1>
          <p className="text-text-muted text-sm">
            실시간 강의 학습 어시스턴트 — 듣고, 이해하고, 기억하세요.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-medium transition-colors mb-10"
        >
          <Plus size={16} />
          새 세션 시작
        </button>

        {/* Recent Sessions */}
        <div>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
            최근 세션
          </h2>

          {loadingHistory ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-surface border border-border rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 border border-border border-dashed rounded-xl">
              <p className="text-text-muted text-sm">아직 세션이 없습니다.</p>
              <p className="text-text-subtle text-xs mt-1">
                위 버튼을 눌러 첫 세션을 시작해보세요.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
              {sessions.length >= 5 && (
                <button
                  onClick={() => navigate('/history')}
                  className="w-full text-center text-xs text-text-muted hover:text-text py-3 transition-colors"
                >
                  전체 보기 →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <StartSessionModal
          onClose={() => setShowModal(false)}
          onStart={handleStart}
        />
      )}
    </div>
  )
}

export { truncate, StartSessionModal }
