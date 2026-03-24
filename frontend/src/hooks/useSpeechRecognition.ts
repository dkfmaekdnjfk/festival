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

export function useSpeechRecognition({
  onTranscript,
  language,
  enabled,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  const shouldRestartRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)

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
      if (event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`)
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      if (shouldRestartRef.current && enabled) {
        setTimeout(() => {
          if (shouldRestartRef.current) {
            try {
              recognition.start()
              setIsListening(true)
            } catch {
              // ignore
            }
          }
        }, 300)
      }
    }

    return recognition
  }, [isSupported, language, enabled])

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
    } catch (err) {
      setError(String(err))
    }
  }, [isSupported, createRecognition])

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
  }, [])

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

  return { isListening, isSupported, start, stop, error }
}
