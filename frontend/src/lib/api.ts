const BASE = 'http://localhost:8000'

export interface Session {
  id: string
  title: string
  speaker: string
  session_type: string
  group: string
  created_at: string
  started_at: string
  ended_at?: string
  status: 'active' | 'ended'
  summary?: {
    summary: string
    key_concepts: { name: string; definition: string }[]
    unclear_points: string[]
    review_questions: { question: string; answer: string }[]
  }
}

export interface Schedule {
  id: string
  title: string
  group: string
  speaker: string
  session_type: string
  day_of_week: number
  time: string
  created_at: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export async function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/health')
}

export async function getEnvKeys(): Promise<Record<string, boolean>> {
  return request<Record<string, boolean>>('/env-keys')
}

export async function getSessions(): Promise<Session[]> {
  return request<Session[]>('/sessions')
}

export async function getSession(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}`)
}

export async function exportSession(
  id: string,
  obsidianPath: string,
  apiKey: string
): Promise<{ path: string }> {
  return request<{ path: string }>(`/sessions/${id}/export`, {
    method: 'POST',
    body: JSON.stringify({ obsidian_path: obsidianPath, api_key: apiKey }),
  })
}

export async function createSession(data: {
  title: string
  speaker: string
  session_type: string
  api_key?: string
  obsidian_path?: string
}): Promise<{ session_id: string }> {
  return request<{ session_id: string }>('/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getGroups(): Promise<string[]> {
  return request<string[]>('/groups')
}

export async function getSchedules(): Promise<Schedule[]> {
  return request<Schedule[]>('/schedules')
}

export async function createSchedule(data: Omit<Schedule, 'id' | 'created_at'>): Promise<Schedule> {
  return request<Schedule>('/schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteSchedule(id: string): Promise<void> {
  return request<void>(`/schedules/${id}`, { method: 'DELETE' })
}
