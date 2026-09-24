import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_ADJUSTMENTS,
  applyAdjustments,
  grayWorldWhiteBalance,
  isIdentity,
  type PhotoAdjustments,
} from '../import/photoAdjust'

interface Props {
  file: File
  /** 캔버스(적용됨) 또는 원본(보정 없이) 또는 null(취소)로 부른다. */
  onDone: (canvas: HTMLCanvasElement | null) => void
}

const PREVIEW_MAX = 480

/** 사진(JPG·PNG)을 새 레이어로 불러오기 전에 밝기·색을 조정하는 화면. */
export default function PhotoAdjust({ file, onDone }: Props) {
  const [adj, setAdj] = useState<PhotoAdjustments>(DEFAULT_ADJUSTMENTS)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<ImageData | null>(null)
  const sourceRef = useRef<HTMLCanvasElement | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        let width: number
        let height: number
        let drawSource: CanvasImageSource
        let bitmap: ImageBitmap | null = null
        if (typeof createImageBitmap === 'function') {
          bitmap = await createImageBitmap(file)
          width = bitmap.width
          height = bitmap.height
          drawSource = bitmap
        } else {
          const url = URL.createObjectURL(file)
          urlRef.current = url
          const img = new Image()
          img.src = url
          await img.decode()
          width = img.naturalWidth
          height = img.naturalHeight
          drawSource = img
        }
        if (cancelled) {
          bitmap?.close()
          return
        }
        const source = document.createElement('canvas')
        source.width = width
        source.height = height
        source.getContext('2d')!.drawImage(drawSource, 0, 0)
        bitmap?.close() // 원본 캔버스에 그렸으니 더 안 든다. ImageBitmap은 메모리를 따로 잡는다.
        sourceRef.current = source

        const scale = Math.min(1, PREVIEW_MAX / Math.max(width, height))
        const preview = previewRef.current
        if (!preview) return
        preview.width = Math.max(1, Math.round(width * scale))
        preview.height = Math.max(1, Math.round(height * scale))
        const pctx = preview.getContext('2d')!
        pctx.imageSmoothingQuality = 'high'
        pctx.drawImage(source, 0, 0, preview.width, preview.height)
        baseRef.current = pctx.getImageData(0, 0, preview.width, preview.height)
        setReady(true)
      } catch {
        if (!cancelled) setError('사진을 읽지 못했습니다. 다른 파일로 시도해 주세요.')
      }
    })()
    return () => {
      cancelled = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [file])

  useEffect(() => {
    const base = baseRef.current
    const preview = previewRef.current
    if (!base || !preview) return
    const copy = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height)
    applyAdjustments(copy.data, adj)
    preview.getContext('2d')!.putImageData(copy, 0, 0)
  }, [adj, ready])

  const set =
    <K extends keyof PhotoAdjustments>(key: K) =>
    (value: number) =>
      setAdj((a) => ({ ...a, [key]: value }))

  const autoWhiteBalance = () => {
    const base = baseRef.current
    if (!base) return
    setAdj((a) => ({ ...a, ...grayWorldWhiteBalance(base.data) }))
  }

  const finish = (useAdjustments: boolean) => {
    const source = sourceRef.current
    if (!source) return
    if (useAdjustments && !isIdentity(adj)) {
      const ctx = source.getContext('2d')!
      const image = ctx.getImageData(0, 0, source.width, source.height)
      applyAdjustments(image.data, adj)
      ctx.putImageData(image, 0, 0)
    }
    onDone(source)
  }

  const slider = (
    key: keyof PhotoAdjustments,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string = (v) => v.toFixed(2),
  ) => (
    <label className="photo-adjust__slider">
      <span>{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={adj[key]}
        disabled={!ready}
        onChange={(e) => set(key)(Number(e.target.value))}
      />
      <span className="photo-adjust__value">{format(adj[key])}</span>
    </label>
  )

  return (
    <div className="modal" role="presentation">
      <div className="modal__box photo-adjust" role="dialog" aria-modal="true" aria-labelledby="photo-adjust-title">
        <h2 id="photo-adjust-title">사진 보정해서 불러오기</h2>

        {error ? (
          <p className="message message--error" role="alert">
            {error}
          </p>
        ) : (
          <>
            <canvas ref={previewRef} className="photo-adjust__preview" aria-label="보정 미리보기" />
            {!ready && <p className="panel-empty">사진을 읽는 중…</p>}

            <div className="photo-adjust__sliders">
              {slider('exposureEv', '노출', -2, 2, 0.1, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`)}
              {slider('wbR', '빨강 균형', 0.5, 1.8, 0.02)}
              {slider('wbG', '초록 균형', 0.5, 1.8, 0.02)}
              {slider('wbB', '파랑 균형', 0.5, 1.8, 0.02)}
              {slider('highlights', '밝은 영역', -100, 100, 1, (v) => `${v}`)}
              {slider('shadows', '어두운 영역', -100, 100, 1, (v) => `${v}`)}
              {slider('blackPoint', '검정점', 0, 250, 1, (v) => `${v}`)}
              {slider('whitePoint', '흰점', 5, 255, 1, (v) => `${v}`)}
              {slider('gamma', '중간톤', 0.3, 3, 0.05)}
            </div>

            <div className="settings__buttons">
              <button className="btn" onClick={autoWhiteBalance} disabled={!ready}>
                자동 화이트밸런스
              </button>
              <button className="btn" onClick={() => setAdj(DEFAULT_ADJUSTMENTS)} disabled={!ready}>
                초기화
              </button>
            </div>
          </>
        )}

        <p className="panel-empty">
          카메라 RAW 파일(.CR2·.NEF 등)은 이 화면에서 직접 열 수 없습니다. 전용 복원 엔진이 필요해서, JPG·PNG로 바꾼
          사진의 밝기·색만 조정합니다.
        </p>

        <div className="modal__buttons">
          <button className="btn" onClick={() => onDone(null)}>
            취소
          </button>
          <button className="btn" disabled={!ready} onClick={() => finish(false)}>
            보정 없이 불러오기
          </button>
          <button className="btn btn--primary" disabled={!ready} onClick={() => finish(true)}>
            적용해서 불러오기
          </button>
        </div>
      </div>
    </div>
  )
}
