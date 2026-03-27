import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSpeechRecognitionOptions {
  onTranscript: (text: string, isFinal: boolean) => void
  language: string
  enabled: boolean
}

interface UseSpeechRecognitionReturn {
  isListening: boolean
  isSupported: boolean
  start: () => void
  stop: () => void
  error: string | null
}

// Web Speech API type declarations
interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognition
}

// Extend Window for webkit prefix
declare global {
  interface Window {
    SpeechRecognition?: ISpeechRecognitionConstructor
    webkitSpeechRecognition?: ISpeechRecognitionConstructor
  }
}

interface UseSpeechRecognitionReturn {
  isListening: boolean
  isSupported: boolean
  start: () => void
  stop: () => void
  error: string | null
  volume: number
}

export function useSpeechRecognition({
  onTranscript,
  language,
  enabled,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolume] = useState(0)
  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  const shouldRestartRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)
  const rafRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const createRecognition = useCallback(() => {
    if (!isSupported) return null
    const SpeechRecognitionAPI =
      window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) return null
    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        const isFinal = result.isFinal
        onTranscriptRef.current(text, isFinal)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        setError('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해주세요.')
        shouldRestartRef.current = false
      } else if (event.error === 'no-speech') {
        // Expected when no speech detected — will auto-restart via onend
      } else if (event.error !== 'aborted') {
        setError(`음성 인식 오류: ${event.error}`)
      }
    }

    recognition.onend = () => {
      // Use ref only — don't capture `enabled` from closure (stale on first call)
      if (shouldRestartRef.current) {
        setTimeout(() => {
          if (shouldRestartRef.current) {
            try {
              recognition.start()
            } catch {
              // ignore
            }
          }
        }, 100)
      } else {
        setIsListening(false)
      }
    }

    return recognition
  }, [isSupported, language])

  const startVolumeMonitor = useCallback(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setVolume(Math.min(1, avg / 60))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }).catch(() => {})
  }, [])

  const stopVolumeMonitor = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    streamRef.current = null
    audioCtxRef.current = null
    analyserRef.current = null
    setVolume(0)
  }, [])

  const start = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser.')
      return
    }
    setError(null)
    shouldRestartRef.current = true

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
    }

    const recognition = createRecognition()
    if (!recognition) return
    recognitionRef.current = recognition

    try {
      recognition.start()
      setIsListening(true)
      startVolumeMonitor()
    } catch (err) {
      setError(String(err))
    }
  }, [isSupported, createRecognition, startVolumeMonitor])

  const stop = useCallback(() => {
    shouldRestartRef.current = false
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
    }
    setIsListening(false)
    stopVolumeMonitor()
  }, [stopVolumeMonitor])

  // Stop when enabled becomes false
  useEffect(() => {
    if (!enabled && isListening) {
      stop()
    }
  }, [enabled, isListening, stop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // ignore
        }
      }
    }
  }, [])

  return { isListening, isSupported, start, stop, error, volume, downloadLastChunk: undefined as (() => void) | undefined }
}
