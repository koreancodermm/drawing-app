import { useMemo, useState } from 'react'
import {
  CUSTOM_PRESET_ID,
  DEFAULT_DPI,
  MAX_DPI,
  MIN_DPI,
  PAPER_PRESETS,
  buildCanvasSpec,
  estimateMemoryMb,
  type CanvasSpec,
  type Orientation,
  type Unit,
} from '../canvas/paper'

interface Props {
  onCreate: (spec: CanvasSpec, name: string) => void
  onCancel?: () => void
  defaultName?: string
}

const DPI_CHOICES = [72, 96, 150, 200, 300]

export default function NewDrawing({ onCreate, onCancel, defaultName = '새 그림' }: Props) {
  const [name, setName] = useState(defaultName)
  const [presetId, setPresetId] = useState('A4')
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [unit, setUnit] = useState<Unit>('mm')
  const [customWidth, setCustomWidth] = useState(210)
  const [customHeight, setCustomHeight] = useState(297)
  const [dpi, setDpi] = useState(DEFAULT_DPI)
  const [background, setBackground] = useState('#ffffff')

  const isCustom = presetId === CUSTOM_PRESET_ID
  const result = useMemo(
    () =>
      buildCanvasSpec({ presetId, orientation, unit, customWidth, customHeight, dpi, background }),
    [presetId, orientation, unit, customWidth, customHeight, dpi, background],
  )
  const { spec, error, warning } = result

  return (
    <main className="new">
      <h1 className="new__title">새 그림</h1>
      <form
        className="new__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (spec) onCreate(spec, name.trim() || defaultName)
        }}
      >
        <label className="field">
          <span>이름</span>
          <input
            type="text"
            className="text-input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span>용지 크기</span>
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {PAPER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.widthMm}×{p.heightMm}mm)
              </option>
            ))}
            <option value={CUSTOM_PRESET_ID}>직접 입력</option>
          </select>
        </label>

        <fieldset className="field field--row" disabled={isCustom}>
          <legend>방향</legend>
          <label>
            <input
              type="radio"
              name="orientation"
              checked={orientation === 'portrait'}
              onChange={() => setOrientation('portrait')}
            />
            세로
          </label>
          <label>
            <input
              type="radio"
              name="orientation"
              checked={orientation === 'landscape'}
              onChange={() => setOrientation('landscape')}
            />
            가로
          </label>
        </fieldset>

        {isCustom && (
          <div className="field-group">
            <label className="field">
              <span>단위</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                <option value="mm">mm</option>
                <option value="px">px</option>
              </select>
            </label>
            <label className="field">
              <span>가로 ({unit})</span>
              <input
                type="number"
                min={1}
                value={customWidth}
                onChange={(e) => setCustomWidth(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>세로 ({unit})</span>
              <input
                type="number"
                min={1}
                value={customHeight}
                onChange={(e) => setCustomHeight(Number(e.target.value))}
              />
            </label>
          </div>
        )}

        <label className="field">
          <span>
            해상도(DPI) {MIN_DPI}~{MAX_DPI}
          </span>
          <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            {DPI_CHOICES.map((d) => (
              <option key={d} value={d}>
                {d} DPI{d === DEFAULT_DPI ? ' (기본)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>배경색</span>
          <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
        </label>

        <p className="new__summary" aria-live="polite">
          {spec ? (
            <>
              <strong>
                {spec.widthPx} × {spec.heightPx} px
              </strong>{' '}
              (약 {Math.round(estimateMemoryMb(spec.widthPx, spec.heightPx))}MB)
            </>
          ) : (
            '크기를 확인해 주세요.'
          )}
        </p>
        {error && (
          <p className="message message--error" role="alert">
            {error}
          </p>
        )}
        {warning && (
          <p className="message message--warn" role="status">
            {warning}
          </p>
        )}

        <div className="new__actions">
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel}>
              취소
            </button>
          )}
          <button type="submit" className="btn btn--primary" disabled={!spec}>
            그리기 시작
          </button>
        </div>
      </form>
    </main>
  )
}
