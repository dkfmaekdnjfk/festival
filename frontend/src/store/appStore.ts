import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Provider = 'anthropic' | 'openai' | 'deepseek' | 'gemini'

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  deepseek: 'DeepSeek',
  gemini: 'Google (Gemini)',
}

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-1.5-pro',
}

export const API_KEY_PLACEHOLDERS: Record<Provider, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  deepseek: 'sk-...',
  gemini: 'AI...',
}

export interface Settings {
  provider: Provider
  apiKey: string
  model: string
  obsidianPath: string
  language: 'ko' | 'en'
  autoSave: boolean
  defaultSessionType: string
}

export interface Concept {
  name: string
  definition: string
  first_seen?: string
}

export interface Message {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  streaming?: boolean
}

export interface SessionSummary {
  summary: string
  key_concepts: Concept[]
  unclear_points: string[]
  review_questions: { question: string; answer: string }[]
}

interface AppStore {
  // Settings (persisted)
  settings: Settings
  updateSettings: (s: Partial<Settings>) => void

  // Session state
  sessionId: string | null
  sessionStatus: 'idle' | 'starting' | 'active' | 'ending' | 'ended'
  sessionTitle: string
  sessionSpeaker: string
  sessionType: string
  sessionGroup: string
  sessionDate: string    // YYYY-MM-DD
  transcript: string
  interimTranscript: string
  concepts: Concept[]
  messages: Message[]
  summary: SessionSummary | null
  obsidianPath: string | null
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  agentStatus: string

  // Actions
  setSessionInfo: (title: string, speaker: string, type: string, group: string, date?: string) => void
  setSessionId: (id: string) => void
  startSession: () => void
  endSession: () => void
  appendTranscript: (text: string, isFinal: boolean) => void
  addConcepts: (concepts: Concept[]) => void
  addMessage: (msg: Message) => void
  updateLastMessage: (text: string) => void
  setSummary: (s: SessionSummary) => void
  setObsidianSaved: (path: string) => void
  setWsStatus: (s: AppStore['wsStatus']) => void
  setAgentStatus: (s: string) => void
  resetSession: () => void
}

const defaultSettings: Settings = {
  provider: 'anthropic',
  apiKey: '',
  model: DEFAULT_MODELS.anthropic,
  obsidianPath: '',
  language: 'ko',
  autoSave: false,
  defaultSessionType: '수업',
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Settings
      settings: defaultSettings,
      updateSettings: (s) =>
        set((state) => ({ settings: { ...state.settings, ...s } })),

      // Session state
      sessionId: null,
      sessionStatus: 'idle',
      sessionTitle: '',
      sessionSpeaker: '',
      sessionType: '수업',
      sessionGroup: '',
      sessionDate: new Date().toISOString().slice(0, 10),
      transcript: '',
      interimTranscript: '',
      concepts: [],
      messages: [],
      summary: null,
      obsidianPath: null,
      wsStatus: 'disconnected',
      agentStatus: '',

      // Actions
      setSessionInfo: (title, speaker, type, group, date) =>
        set({
          sessionTitle: title,
          sessionSpeaker: speaker,
          sessionType: type,
          sessionGroup: group,
          sessionDate: date ?? new Date().toISOString().slice(0, 10),
        }),

      setSessionId: (id) => set({ sessionId: id }),

      startSession: () =>
        set({
          sessionStatus: 'active',
          transcript: '',
          interimTranscript: '',
          concepts: [],
          messages: [],
          summary: null,
          obsidianPath: null,
          agentStatus: '세션 시작됨',
        }),

      endSession: () => set({ sessionStatus: 'ending' }),

      appendTranscript: (text, isFinal) => {
        if (isFinal) {
          set((state) => ({
            transcript: state.transcript
              ? state.transcript + ' ' + text
              : text,
            interimTranscript: '',
          }))
        } else {
          set({ interimTranscript: text })
        }
      },

      addConcepts: (concepts) =>
        set((state) => {
          const existing = new Map(state.concepts.map((c) => [c.name, c]))
          concepts.forEach((c) => existing.set(c.name, c))
          return { concepts: Array.from(existing.values()) }
        }),

      addMessage: (msg) =>
        set((state) => ({ messages: [...state.messages, msg] })),

      updateLastMessage: (text) =>
        set((state) => {
          const messages = [...state.messages]
          if (messages.length > 0) {
            const last = messages[messages.length - 1]
            if (last.role === 'assistant') {
              messages[messages.length - 1] = { ...last, text, streaming: true }
            } else {
              messages.push({
                role: 'assistant',
                text,
                timestamp: new Date().toISOString(),
                streaming: true,
              })
            }
          } else {
            messages.push({
              role: 'assistant',
              text,
              timestamp: new Date().toISOString(),
              streaming: true,
            })
          }
          return { messages }
        }),

      setSummary: (s) =>
        set({
          summary: s,
          sessionStatus: 'ended',
        }),

      setObsidianSaved: (path) => set({ obsidianPath: path }),

      setWsStatus: (s) => set({ wsStatus: s }),

      setAgentStatus: (s) => set({ agentStatus: s }),

      resetSession: () =>
        set({
          sessionId: null,
          sessionStatus: 'idle',
          sessionTitle: '',
          sessionSpeaker: '',
          sessionType: get().settings.defaultSessionType || '수업',
          sessionGroup: '',
          sessionDate: new Date().toISOString().slice(0, 10),
          transcript: '',
          interimTranscript: '',
          concepts: [],
          messages: [],
          summary: null,
          obsidianPath: null,
          wsStatus: 'disconnected',
          agentStatus: '',
        }),
    }),
    {
      name: 'festival-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
)
