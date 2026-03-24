import { useState } from 'react'
import { Eye, EyeOff, Save, Check } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { PROVIDER_LABELS, DEFAULT_MODELS, API_KEY_PLACEHOLDERS, type Provider } from '../store/appStore'

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      {description && (
        <p className="mt-0.5 text-xs text-text-muted">{description}</p>
      )}
    </div>
  )
}

export function Settings() {
  const { settings, updateSettings } = useAppStore()
  const [showApiKey, setShowApiKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const [localProvider, setLocalProvider] = useState<Provider>(settings.provider)
  const [localApiKey, setLocalApiKey] = useState(settings.apiKey)
  const [localModel, setLocalModel] = useState(settings.model || DEFAULT_MODELS[settings.provider])
  const [localObsidianPath, setLocalObsidianPath] = useState(settings.obsidianPath)
  const [localAutoSave, setLocalAutoSave] = useState(settings.autoSave)
  const [localLanguage, setLocalLanguage] = useState(settings.language)
  const [localSessionType, setLocalSessionType] = useState(settings.defaultSessionType)

  const handleProviderChange = (p: Provider) => {
    setLocalProvider(p)
    setLocalModel(DEFAULT_MODELS[p])
    setLocalApiKey('')
  }

  const handleSave = () => {
    updateSettings({
      provider: localProvider,
      apiKey: localApiKey,
      model: localModel,
      obsidianPath: localObsidianPath,
      autoSave: localAutoSave,
      language: localLanguage,
      defaultSessionType: localSessionType,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-lg font-semibold text-text mb-8">설정</h1>

        {/* AI Provider */}
        <section className="mb-8 p-5 rounded-xl border border-border bg-surface">
          <SectionHeader
            title="AI 공급자"
            description="사용할 LLM 공급자와 API 키를 설정합니다."
          />
          <div className="space-y-4">
            {/* Provider selector */}
            <label className="block">
              <span className="text-xs text-text-muted mb-1.5 block">공급자</span>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleProviderChange(p)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-colors text-left ${
                      localProvider === p
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface-elevated text-text-muted hover:border-border/80 hover:text-text'
                    }`}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
            </label>

            {/* API Key */}
            <label className="block">
              <span className="text-xs text-text-muted mb-1.5 block">
                {PROVIDER_LABELS[localProvider]} API Key
              </span>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  placeholder={API_KEY_PLACEHOLDERS[localProvider]}
                  className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
                >
                  {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            {/* Model */}
            <label className="block">
              <span className="text-xs text-text-muted mb-1.5 block">모델</span>
              <input
                type="text"
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
                placeholder={DEFAULT_MODELS[localProvider]}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 transition-colors"
              />
              <p className="mt-1 text-xs text-text-muted">
                기본값: <code className="text-primary/80">{DEFAULT_MODELS[localProvider]}</code>
              </p>
            </label>
          </div>
        </section>

        {/* Obsidian */}
        <section className="mb-8 p-5 rounded-xl border border-border bg-surface">
          <SectionHeader
            title="Obsidian"
            description="로컬 Obsidian 볼트 경로를 설정하면 세션 종료 후 자동으로 노트가 저장됩니다."
          />
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs text-text-muted mb-1.5 block">볼트 경로</span>
              <input
                type="text"
                value={localObsidianPath}
                onChange={(e) => setLocalObsidianPath(e.target.value)}
                placeholder="/Users/yourname/Documents/ObsidianVault"
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-subtle focus:outline-none focus:border-primary/60 transition-colors"
              />
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setLocalAutoSave((v) => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  localAutoSave ? 'bg-primary' : 'bg-surface-elevated border border-border'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    localAutoSave ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <span className="text-sm text-text">세션 종료 시 자동 저장</span>
            </label>
          </div>
        </section>

        {/* Session Defaults */}
        <section className="mb-8 p-5 rounded-xl border border-border bg-surface">
          <SectionHeader title="세션 기본값" />
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs text-text-muted mb-1.5 block">언어</span>
              <select
                value={localLanguage}
                onChange={(e) => setLocalLanguage(e.target.value as 'ko' | 'en')}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-text-muted mb-1.5 block">기본 세션 유형</span>
              <select
                value={localSessionType}
                onChange={(e) => setLocalSessionType(e.target.value)}
                className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="수업">수업</option>
                <option value="세미나">세미나</option>
                <option value="학회">학회</option>
                <option value="강연">강연</option>
              </select>
            </label>
          </div>
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saved ? (
            <>
              <Check size={15} />
              저장됨
            </>
          ) : (
            <>
              <Save size={15} />
              설정 저장
            </>
          )}
        </button>
      </div>
    </div>
  )
}
