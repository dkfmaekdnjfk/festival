import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import {
  getSessions,
  getSchedules,
  createSchedule,
  deleteSchedule,
  type Session,
  type Schedule,
} from '../lib/api'

// ---------------------------------------------------------------------------
// Palette helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DAY_LABELS_SHORT = ['일', '월', '화', '수', '목', '금', '토']
const DAY_LABELS_FULL = ['월', '화', '수', '목', '금', '토', '일']

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayYMD(): string {
  return toYMD(new Date())
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

/** Returns JS day-of-week (0=Sun) for a grid that starts on Sunday */
function buildCalendarGrid(year: number, month: number): (Date | null)[] {
  const days = getDaysInMonth(year, month)
  const firstDow = days[0].getDay() // 0=Sun
  const grid: (Date | null)[] = Array(firstDow).fill(null)
  grid.push(...days)
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

// ---------------------------------------------------------------------------
// Schedule form state
// ---------------------------------------------------------------------------

const SESSION_TYPES = ['수업', '세미나', '학회', '강연']

interface ScheduleFormState {
  title: string
  group: string
  speaker: string
  session_type: string
  day_of_week: number
  time: string
}

const emptyForm = (): ScheduleFormState => ({
  title: '',
  group: '',
  speaker: '',
  session_type: '수업',
  day_of_week: 0,
  time: '',
})

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GroupDot({ group }: { group: string }) {
  const p = getGroupPalette(group)
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${p.dot}`} />
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedYMD, setSelectedYMD] = useState<string>(todayYMD())
  const [sessions, setSessions] = useState<Session[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ScheduleFormState>(emptyForm())
  const [submitting, setSubmitting] = useState(false)

  // Load sessions + schedules
  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
    getSchedules()
      .then(setSchedules)
      .catch(() => setSchedules([]))
  }, [])

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  // Map of YMD -> sessions[]
  const sessionsByDate = sessions.reduce<Record<string, Session[]>>((acc, s) => {
    const raw = s.started_at || s.created_at || ''
    if (!raw) return acc
    const ymd = raw.slice(0, 10)
    if (!acc[ymd]) acc[ymd] = []
    acc[ymd].push(s)
    return acc
  }, {})

  // For a given JS Date, which schedules apply? day_of_week is 0=Mon..6=Sun
  function schedulesForDate(date: Date): Schedule[] {
    const jsDow = date.getDay() // 0=Sun
    // Convert JS dow to our 0=Mon..6=Sun format
    const dow = jsDow === 0 ? 6 : jsDow - 1
    return schedules.filter((sc) => sc.day_of_week === dow)
  }

  const grid = buildCalendarGrid(year, month)

  // Sessions for selected day
  const selectedSessions = sessionsByDate[selectedYMD] ?? []

  // Schedules for selected day
  const selectedDate = new Date(selectedYMD + 'T00:00:00')
  const selectedSchedules = schedulesForDate(selectedDate)

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // ---------------------------------------------------------------------------
  // Schedule CRUD
  // ---------------------------------------------------------------------------

  async function handleCreateSchedule() {
    if (!form.title.trim()) return
    setSubmitting(true)
    try {
      const created = await createSchedule(form)
      setSchedules(prev => [...prev, created])
      setForm(emptyForm())
      setShowForm(false)
    } catch {
      // silent
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteSchedule(id: string) {
    try {
      await deleteSchedule(id)
      setSchedules(prev => prev.filter(sc => sc.id !== id))
    } catch {
      // silent
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const monthLabel = new Date(year, month, 1).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
  })

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-lg font-semibold text-text">캘린더</h1>

        {/* Top area: calendar + side panel */}
        <div className="flex gap-6 items-start">
          {/* ---- Calendar ---- */}
          <div className="flex-1 bg-surface border border-border rounded-2xl p-5 min-w-0">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={prevMonth}
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-elevated transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-text">{monthLabel}</span>
              <button
                onClick={nextMonth}
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-elevated transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 mb-2">
              {DAY_LABELS_SHORT.map((d) => (
                <div key={d} className="text-center text-[11px] text-text-muted font-medium py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Date grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((date, idx) => {
                if (!date) {
                  return <div key={`empty-${idx}`} className="aspect-square" />
                }
                const ymd = toYMD(date)
                const isToday = ymd === todayYMD()
                const isSelected = ymd === selectedYMD
                const daySessions = sessionsByDate[ymd] ?? []
                const daySchedules = schedulesForDate(date)
                const hasSessions = daySessions.length > 0
                const hasSchedules = daySchedules.length > 0
                const isFuture = date > today

                return (
                  <button
                    key={ymd}
                    onClick={() => setSelectedYMD(ymd)}
                    className={[
                      'aspect-square flex flex-col items-center justify-start pt-1 rounded-lg text-xs transition-colors relative',
                      isSelected
                        ? 'bg-primary/20 text-primary'
                        : isToday
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-text hover:bg-surface-elevated',
                      hasSchedules && isFuture && !isSelected
                        ? 'border border-dashed border-border'
                        : '',
                    ].join(' ')}
                  >
                    <span className={isToday ? 'font-bold' : ''}>{date.getDate()}</span>
                    {hasSessions && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center px-0.5">
                        {daySessions.slice(0, 3).map((s) => (
                          <GroupDot key={s.id} group={s.group || ''} />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ---- Selected day panel ---- */}
          <div className="w-72 shrink-0 bg-surface border border-border rounded-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-text">
              {new Date(selectedYMD + 'T00:00:00').toLocaleDateString('ko-KR', {
                month: 'long',
                day: 'numeric',
                weekday: 'short',
              })}
            </p>

            {/* Sessions of the day */}
            <div>
              <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">세션</p>
              {selectedSessions.length === 0 ? (
                <p className="text-xs text-text-subtle">세션 없음</p>
              ) : (
                <div className="space-y-2">
                  {selectedSessions.map((s) => (
                    <div key={s.id} className="p-2.5 bg-surface-elevated border border-border rounded-lg">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <p className="text-xs font-medium text-text">{s.title}</p>
                        {s.group && <GroupBadge group={s.group} />}
                      </div>
                      {s.speaker && (
                        <p className="text-[10px] text-text-muted">{s.speaker}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Schedules of the day */}
            {selectedSchedules.length > 0 && (
              <div>
                <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">정기 일정</p>
                <div className="space-y-2">
                  {selectedSchedules.map((sc) => (
                    <div key={sc.id} className="p-2.5 bg-surface-elevated border border-dashed border-border rounded-lg">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <p className="text-xs font-medium text-text">{sc.title}</p>
                        {sc.group && <GroupBadge group={sc.group} />}
                      </div>
                      {sc.time && <p className="text-[10px] text-text-muted">{sc.time}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---- Recurring schedules section ---- */}
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text">정기 일정</h2>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-text-muted hover:text-text hover:border-primary/40 transition-colors"
            >
              {showForm ? <X size={13} /> : <Plus size={13} />}
              {showForm ? '취소' : '추가'}
            </button>
          </div>

          {/* Add form */}
          {showForm && (
            <div className="mb-4 p-4 bg-surface-elevated border border-border rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block col-span-2">
                  <span className="text-[11px] text-text-muted mb-1 block">제목 *</span>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="예: 기계학습 수업"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] text-text-muted mb-1 block">그룹</span>
                  <input
                    type="text"
                    value={form.group}
                    onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
                    placeholder="기계학습"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] text-text-muted mb-1 block">강사</span>
                  <input
                    type="text"
                    value={form.speaker}
                    onChange={(e) => setForm((f) => ({ ...f, speaker: e.target.value }))}
                    placeholder="김교수"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] text-text-muted mb-1 block">요일</span>
                  <div className="flex gap-1 flex-wrap">
                    {DAY_LABELS_FULL.map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, day_of_week: i }))}
                        className={`w-7 h-7 rounded-lg text-[11px] font-medium border transition-colors ${
                          form.day_of_week === i
                            ? 'border-primary bg-primary/15 text-primary'
                            : 'border-border text-text-muted hover:border-primary/40'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="block">
                  <span className="text-[11px] text-text-muted mb-1 block">시간</span>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] text-text-muted mb-1 block">세션 유형</span>
                  <div className="flex gap-1 flex-wrap">
                    {SESSION_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, session_type: t }))}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                          form.session_type === t
                            ? 'border-primary bg-primary/15 text-primary'
                            : 'border-border text-text-muted hover:border-primary/40'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </label>
              </div>

              <button
                onClick={handleCreateSchedule}
                disabled={!form.title.trim() || submitting}
                className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors"
              >
                {submitting ? '저장 중...' : '저장'}
              </button>
            </div>
          )}

          {/* Schedules list grouped by day */}
          {schedules.length === 0 && !showForm ? (
            <p className="text-xs text-text-subtle text-center py-4">
              정기 일정이 없습니다.
            </p>
          ) : (
            <div className="space-y-1">
              {DAY_LABELS_FULL.map((dayLabel, i) => {
                const daySchedules = schedules.filter((sc) => sc.day_of_week === i)
                if (daySchedules.length === 0) return null
                return (
                  <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border last:border-0">
                    <span className="w-5 text-[11px] font-semibold text-text-muted shrink-0 mt-0.5">{dayLabel}</span>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {daySchedules.map((sc) => (
                        <div key={sc.id} className="flex items-center justify-between gap-2 group">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-xs font-medium text-text">{sc.title}</span>
                            {sc.group && <GroupBadge group={sc.group} />}
                            {sc.time && (
                              <span className="text-[10px] text-text-muted">{sc.time}</span>
                            )}
                            {sc.speaker && (
                              <span className="text-[10px] text-text-subtle">{sc.speaker}</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteSchedule(sc.id)}
                            className="p-1 rounded text-text-subtle hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
