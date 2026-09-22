import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiPanelProps } from '../ui/aiHost'
import AiConsent from './AiConsent'
import { AiError } from './gemini'
import { canvasToJpegBase64 } from './image'
import { giveFeedback, suggestIdeas, suggestPalette } from './tasks'
import { giveConsent, hasConsent, useAiReady } from './keyStore'

type Mode = 'ideas' | 'palette' | 'feedback'

const MODES: { id: Mode; label: string; placeholder: string; button: string }[] = [
  { id: 'ideas', label: '그릴 거리', placeholder: '예: 우리 동네, 바다, 고양이', button: '아이디어 받기' },
  { id: 'palette', label: '색 조합', placeholder: '예: 비 오는 날의 차분한 저녁', button: '색 추천받기' },
  { id: 'feedback', label: '그림 피드백', placeholder: '궁금한 점이 있으면 적어 주세요(비워도 됩니다)', button: '피드백 받기' },
]

type Result = { mode: 'ideas' | 'feedback'; text: string } | { mode: 'palette'; colors: string[] }

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** 그리기 화면의 AI 제안 패널. 결과는 여기에만 보이고 그림은 절대 자동으로 바뀌지 않는다. */
export default function AiPanel({ getCanvas, onAddColors }: AiPanelProps) {
  const ready = useAiReady()
  const online = useOnline()
  const [mode, setMode] = useState<Mode>('ideas')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const [asking, setAsking] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  // 한도 초과 뒤 남은 시간을 1초마다 줄인다.
  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const run = useCallback(async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      if (mode === 'ideas') setResult({ mode, text: await suggestIdeas(input, controller.signal) })
      else if (mode === 'palette') setResult({ mode, colors: await suggestPalette(input, controller.signal) })
      else {
        const canvas = getCanvas()
        if (!canvas) throw new AiError('bad-response', '그림을 읽지 못했습니다.')
        setResult({ mode, text: await giveFeedback(canvasToJpegBase64(canvas), input, controller.signal) })
      }
    } catch (e) {
      if (e instanceof AiError) {
        setError(e.message)
        if (e.kind === 'rate-limit' && e.retrySeconds) setWait(e.retrySeconds)
      } else {
        setError(e instanceof Error ? e.message : 'AI를 쓰는 중 문제가 생겼습니다.')
      }
    } finally {
      setBusy(false)
    }
  }, [mode, input, getCanvas])

  if (!ready) return null

  const current = MODES.find((m) => m.id === mode)!
  const blocked = busy || wait > 0 || !online

  const start = () => {
    if (!hasConsent()) setAsking(true)
    else void run()
  }

  return (
    <section className="panel-block ai-panel" aria-label="AI 도우미">
      <h2>AI 도우미</h2>
      <div className="ai-panel__modes" role="group" aria-label="AI 기능 고르기">
        {MODES.map((m) => (
          <button
            key={m.id}
            className="btn"
            aria-pressed={mode === m.id}
            onClick={() => {
              setMode(m.id)
              setResult(null)
              setError(null)
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <label className="ai-panel__field">
        <span className="visually-hidden">{current.label} 입력</span>
        <input
          type="text"
          value={input}
          maxLength={200}
          placeholder={current.placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !blocked) start()
          }}
        />
      </label>
      {mode === 'feedback' && <p className="panel-empty">지금 그린 그림이 구글로 전송됩니다.</p>}
      <button className="btn btn--primary" disabled={blocked} onClick={start}>
        {busy ? '생각하는 중…' : wait > 0 ? `${wait}초 뒤 다시 시도` : current.button}
      </button>

      {!online && (
        <p className="message message--warn" role="status">
          인터넷에 연결되어 있지 않아 AI를 쓸 수 없습니다. 그리기는 그대로 쓸 수 있습니다.
        </p>
      )}
      {error && (
        <p className="message message--error" role="alert">
          {error}
        </p>
      )}

      {result && result.mode !== 'palette' && (
        <div className="ai-panel__result" aria-label="AI 제안">
          {result.text}
        </div>
      )}
      {result && result.mode === 'palette' && (
        <div aria-label="AI 제안">
          <div className="swatches" role="group" aria-label="추천 색">
            {result.colors.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                aria-label={`추천 색 ${c} 팔레트에 추가`}
                title={c}
                onClick={() => onAddColors([c])}
              />
            ))}
          </div>
          <p className="panel-empty">{result.colors.join('  ')}</p>
          <button className="btn" onClick={() => onAddColors(result.colors)}>
            모두 팔레트에 추가
          </button>
        </div>
      )}
      <p className="panel-empty">AI의 답은 참고용입니다. 그림은 자동으로 바뀌지 않습니다.</p>

      {asking && (
        <AiConsent
          onAgree={() => {
            giveConsent()
            setAsking(false)
            void run()
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </section>
  )
}
