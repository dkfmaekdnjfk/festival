import { useCallback, useRef, useState } from 'react'

interface UseWhisperTranscriptionOptions {
  onTranscript: (text: string, isFinal: boolean) => void
  language: string
  enabled: boolean
  apiKey?: string
  keywords?: string[]
  sessionTitle?: string
}

interface UseWhisperTranscriptionReturn {
  isListening: boolean
  isSupported: boolean
  start: () => void
  stop: () => void
  error: string | null
  volume: number
  downloadLastChunk: () => void
}

const SEGMENT_DURATION_MS = 10000

export function useWhisperTranscription({
  onTranscript,
  language,
  apiKey = '',
  keywords = [],
  sessionTitle = '',
}: UseWhisperTranscriptionOptions): UseWhisperTranscriptionReturn {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolume] = useState(0)

  const lastBlobRef = useRef<Blob | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const schedulerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)
  const lastTextRef = useRef('')  // 중복 전송 방지용

  const rafRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  const startSegmentRef = useRef<((stream: MediaStream) => void) | null>(null)

  const isSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices

  const langCode = language.startsWith('ko') ? 'ko' : 'en'

  const sendBlob = useCallback(async (blob: Blob) => {
    console.log('[Whisper] blob size:', blob.size, 'bytes')
    if (blob.size < 500) {
      console.log('[Whisper] blob too small, skipping')
      return
    }

    const formData = new FormData()
    formData.append('audio', new Blob([blob], { type: 'audio/webm' }), 'audio.webm')
    formData.append('language', langCode)
    if (apiKey) formData.append('api_key', apiKey)
    if (sessionTitle) formData.append('session_title', sessionTitle)
    if (keywords.length > 0) formData.append('keywords', keywords.join(', '))

    console.log('[Whisper] sending... langCode:', langCode, 'hasApiKey:', !!apiKey)
    try {
      const res = await fetch('http://localhost:8001/transcribe', {
        method: 'POST',
        body: formData,
      })
      console.log('[Whisper] response status:', res.status)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        const msg = `Whisper 오류: ${(err as { detail?: string }).detail ?? res.statusText}`
        console.error('[Whisper]', msg)
        setError(msg)
        return
      }
      const data = await res.json() as { text: string }
      console.log('[Whisper] transcription:', data.text)
      const text = data.text?.trim()
      if (text && text !== lastTextRef.current) {
        lastTextRef.current = text
        onTranscriptRef.current(text, true)
      }
    } catch (e) {
      const msg = `Whisper 전송 오류: ${String(e)}`
      console.error('[Whisper]', msg)
      setError(msg)
    }
  }, [langCode, apiKey])

  const startVolumeMonitor = useCallback((stream: MediaStream) => {
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
  }, [])

  const stopVolumeMonitor = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    setVolume(0)
  }, [])

  // 단일 세그먼트 녹음: 새 MediaRecorder 시작 → SEGMENT_DURATION_MS 후 중지 → blob 전송 → 반복
  const startSegment = useCallback((stream: MediaStream) => {
    if (!activeRef.current) return

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : ''

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        lastBlobRef.current = blob
        void sendBlob(blob)
      }
      // 다음 세그먼트 시작 (아직 활성 중이면) — ref로 항상 최신 함수 참조
      if (activeRef.current) {
        startSegmentRef.current?.(stream)
      }
    }

    recorder.start()

    // SEGMENT_DURATION_MS 후 중지 → onstop 트리거
    schedulerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop()
      }
    }, SEGMENT_DURATION_MS)
  }, [sendBlob])

  // 항상 최신 startSegment 참조 유지
  startSegmentRef.current = startSegment

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('MediaRecorder가 지원되지 않는 브라우저입니다.')
      return
    }
    // 이미 활성 중이면 두 번째 루프 방지
    if (activeRef.current) return
    setError(null)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      })
    } catch {
      setError('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해주세요.')
      return
    }

    streamRef.current = stream
    activeRef.current = true
    lastTextRef.current = ''
    startVolumeMonitor(stream)
    startSegment(stream)
    setIsListening(true)
  }, [isSupported, startVolumeMonitor, startSegment])

  const stop = useCallback(() => {
    activeRef.current = false

    if (schedulerRef.current) {
      clearTimeout(schedulerRef.current)
      schedulerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop()  // onstop이 마지막 blob 전송
    }
    recorderRef.current = null

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    stopVolumeMonitor()
    setIsListening(false)
  }, [stopVolumeMonitor])

  const downloadLastChunk = useCallback(() => {
    const blob = lastBlobRef.current
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recording_${Date.now()}.webm`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return { isListening, isSupported, start, stop, error, volume, downloadLastChunk }
}
