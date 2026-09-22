import { PATTERN_NAMES } from '../tools/engines/fill'
import { FONT_NAMES, STICKERS } from '../tools/engines/misc'
import type { OptionKey, ToolDef, ToolSettings } from '../tools/types'

const LINE_STYLES = ['실선', '파선', '점선']
const FILL_MODES = ['윤곽만', '채우기만', '윤곽 + 채우기']
const SYMMETRIES = ['좌우', '상하', '좌우 + 상하', '6방향', '8방향']
const ERASER_SHAPES = ['둥근', '네모']
const GRID_STEPS = [5, 10, 20, 50]

const DEFAULT_LABEL: Record<OptionKey, string> = {
  size: '두께',
  opacity: '진하기',
  softness: '부드러움',
  lineStyle: '선 모양',
  fill: '채우기',
  sides: '개수',
  tolerance: '민감도',
  pattern: '무늬',
  color2: '보조 색',
  sticker: '스티커',
  symmetry: '대칭 방식',
  step: '칸 크기(mm)',
  eraserShape: '지우개 모양',
  font: '글꼴',
}

interface Props {
  def: ToolDef
  settings: Required<Pick<ToolSettings, 'size'>> & ToolSettings
  color2: string
  onChange: (key: Exclude<OptionKey, 'color2'>, value: number) => void
  onColor2: (color: string) => void
  /** 도구 색(작은 미리보기 원에 쓴다) */
  color: string
}

/** 고른 도구에 해당하는 옵션만 보여 준다. */
export default function ToolOptions({ def, settings, color2, onChange, onColor2, color }: Props) {
  const label = (key: OptionKey) => def.optionLabels?.[key] ?? DEFAULT_LABEL[key]
  const value = (key: Exclude<OptionKey, 'color2'>, fallback = 0) => settings[key] ?? fallback

  const select = (key: 'lineStyle' | 'fill' | 'pattern' | 'symmetry' | 'eraserShape' | 'font', names: readonly string[]) => (
    <label className="opt" key={key}>
      <span>{label(key)}</span>
      <select value={value(key)} onChange={(e) => onChange(key, Number(e.target.value))}>
        {names.map((n, i) => (
          <option key={n} value={i}>
            {n}
          </option>
        ))}
      </select>
    </label>
  )

  const range = (
    key: 'opacity' | 'softness' | 'tolerance' | 'sides',
    min: number,
    max: number,
    step: number,
    show: (v: number) => string,
  ) => (
    <div className="opt" key={key}>
      <span>
        {label(key)} <output>{show(value(key))}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value(key)}
        aria-label={label(key)}
        onChange={(e) => onChange(key, Number(e.target.value))}
      />
    </div>
  )

  return (
    <div className="tool-options">
      {def.options.map((key) => {
        switch (key) {
          case 'size':
            return (
              <div className="opt" key={key}>
                <span>
                  {label('size')} <output>{settings.size}px</output>
                </span>
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={settings.size}
                  aria-label={label('size')}
                  onChange={(e) => onChange('size', Number(e.target.value))}
                />
                <div className="size-preview" aria-hidden="true">
                  <span
                    style={{
                      width: Math.min(settings.size, 96),
                      height: Math.min(settings.size, 96),
                      background: def.id === 'eraser' ? 'transparent' : color,
                      border: def.id === 'eraser' ? '1px dashed #57606a' : 'none',
                      borderRadius: def.id === 'eraser' && settings.eraserShape === 1 ? 0 : '50%',
                    }}
                  />
                </div>
              </div>
            )
          case 'opacity':
            return range('opacity', 0.05, 1, 0.05, (v) => `${Math.round(v * 100)}%`)
          case 'softness':
            return range('softness', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)
          case 'tolerance':
            return range('tolerance', 0, 128, 1, (v) => String(Math.round(v)))
          case 'sides':
            return range('sides', 3, 12, 1, (v) => `${Math.round(v)}개`)
          case 'lineStyle':
            return select('lineStyle', LINE_STYLES)
          case 'fill':
            return select('fill', FILL_MODES)
          case 'pattern':
            return select('pattern', PATTERN_NAMES)
          case 'symmetry':
            return select('symmetry', SYMMETRIES)
          case 'eraserShape':
            return select('eraserShape', ERASER_SHAPES)
          case 'font':
            return select('font', FONT_NAMES)
          case 'step':
            return (
              <label className="opt" key={key}>
                <span>{label('step')}</span>
                <select value={value('step', 10)} onChange={(e) => onChange('step', Number(e.target.value))}>
                  {GRID_STEPS.map((s) => (
                    <option key={s} value={s}>
                      {s}mm
                    </option>
                  ))}
                </select>
              </label>
            )
          case 'color2':
            return (
              <label className="opt opt--row" key={key}>
                <span>{label('color2')}</span>
                <input type="color" value={color2} aria-label={label('color2')} onChange={(e) => onColor2(e.target.value)} />
              </label>
            )
          case 'sticker':
            return (
              <div className="opt" key={key} role="group" aria-label="스티커 고르기">
                <span>{label('sticker')}</span>
                <div className="sticker-grid">
                  {STICKERS.map((s, i) => (
                    <button
                      key={s.name}
                      className="sticker-btn"
                      aria-pressed={value('sticker') === i}
                      onClick={() => onChange('sticker', i)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )
        }
      })}
    </div>
  )
}
