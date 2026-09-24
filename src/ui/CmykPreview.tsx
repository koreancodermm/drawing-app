import { useEffect, useRef, useState } from 'react'
import { softProofRgb } from '../export/cmyk'

interface Props {
  getCanvas: () => HTMLCanvasElement | null
  onClose: () => void
}

/** "인쇄하면 대략 이렇게 보일 것"이라는 근사 미리보기. 실제 인쇄소 색과는 다를 수 있다(cmyk.ts 참고). */
export default function CmykPreview({ getCanvas, onClose }: Props) {
  const previewRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = getCanvas()
    const preview = previewRef.current
    if (!canvas || !preview) {
      setError('그림을 읽지 못했습니다.')
      return
    }
    preview.width = canvas.width
    preview.height = canvas.height
    const ctx = preview.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    const image = ctx.getImageData(0, 0, preview.width, preview.height)
    softProofRgb(image.data)
    ctx.putImageData(image, 0, 0)
  }, [getCanvas])

  return (
    <div className="modal" role="presentation">
      <div className="modal__box photo-adjust" role="dialog" aria-modal="true" aria-labelledby="cmyk-preview-title">
        <h2 id="cmyk-preview-title">인쇄 미리보기 (CMYK 근사)</h2>
        <p className="message message--warn">
          표준 변환 수식으로 CMYK 잉크로 못 내는 색만 대략 눌러본 것입니다. 실제 인쇄소·프린터의 정확한 색(ICC
          프로파일)은 반영하지 않아 결과가 다를 수 있습니다.
        </p>
        {error ? (
          <p className="message message--error" role="alert">
            {error}
          </p>
        ) : (
          <canvas ref={previewRef} className="photo-adjust__preview" aria-label="CMYK 근사 미리보기" />
        )}
        <div className="modal__buttons">
          <button className="btn btn--primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
