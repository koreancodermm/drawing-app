import { useState } from 'react'
import type { LayerInfo } from '../canvas/layers'

interface Props {
  /** 바닥부터 맨 위까지의 레이어(화면에는 맨 위가 먼저 나온다) */
  layers: readonly LayerInfo[]
  activeId: string
  maxLayers: number
  onSelect: (id: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  onMove: (id: string, index: number) => void
  onVisible: (id: string, visible: boolean) => void
  onLocked: (id: string, locked: boolean) => void
  onRename: (id: string) => void
  /** 슬라이더를 끄는 도중(기록에 남기지 않고 화면만 바꾼다) */
  onOpacityPreview: (id: string, opacity: number) => void
  /** 슬라이더를 놓았을 때(되돌리기 기록에 남긴다) */
  onOpacity: (id: string, opacity: number) => void
}

export default function LayerPanel(props: Props) {
  const { layers, activeId, maxLayers } = props
  const [drag, setDrag] = useState<{ id: string; value: number } | null>(null)
  const shown = [...layers].reverse()
  const active = layers.find((l) => l.id === activeId)
  const atLimit = layers.length >= maxLayers

  return (
    <section className="panel-block layer-panel">
      <div className="layer-panel__head">
        <h2>
          레이어 <span className="layer-count">{layers.length}/{maxLayers}</span>
        </h2>
        <button className="btn" onClick={props.onAdd} disabled={atLimit} title={atLimit ? '레이어를 더 만들 수 없습니다' : '새 레이어 추가'}>
          + 추가
        </button>
      </div>
      {atLimit && (
        <p className="panel-empty" role="status">
          이 크기의 그림에서는 레이어를 {maxLayers}개까지 만들 수 있습니다(큰 용지는 메모리 때문에 더 적습니다).
        </p>
      )}

      <ul className="layer-list" aria-label="레이어 목록">
        {shown.map((layer) => {
          const index = layers.findIndex((l) => l.id === layer.id)
          const isActive = layer.id === activeId
          return (
            <li key={layer.id} className={`layer-row${isActive ? ' is-active' : ''}`} aria-current={isActive ? 'true' : undefined}>
              <button
                className="icon-btn"
                aria-pressed={layer.visible}
                aria-label={`${layer.name} ${layer.visible ? '숨기기' : '보이기'}`}
                title={layer.visible ? '숨기기' : '보이기'}
                onClick={() => props.onVisible(layer.id, !layer.visible)}
              >
                {layer.visible ? '👁' : '➖'}
              </button>
              <button
                className="layer-name"
                onClick={() => props.onSelect(layer.id)}
                onDoubleClick={() => props.onRename(layer.id)}
                title="누르면 선택, 두 번 누르면 이름 바꾸기"
              >
                {layer.name}
              </button>
              <button
                className="icon-btn"
                aria-pressed={layer.locked}
                aria-label={`${layer.name} ${layer.locked ? '잠금 해제' : '잠그기'}`}
                title={layer.locked ? '잠금 해제' : '잠그기'}
                onClick={() => props.onLocked(layer.id, !layer.locked)}
              >
                {layer.locked ? '🔒' : '🔓'}
              </button>
              <button
                className="icon-btn"
                aria-label={`${layer.name} 위로`}
                title="위로"
                disabled={index >= layers.length - 1}
                onClick={() => props.onMove(layer.id, index + 1)}
              >
                ▲
              </button>
              <button
                className="icon-btn"
                aria-label={`${layer.name} 아래로`}
                title="아래로"
                disabled={index <= 0}
                onClick={() => props.onMove(layer.id, index - 1)}
              >
                ▼
              </button>
            </li>
          )
        })}
      </ul>

      {active && (
        <div className="layer-detail">
          <label className="opt">
            <span>
              불투명도 <output>{Math.round((drag?.id === active.id ? drag.value : active.opacity) * 100)}%</output>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              aria-label="레이어 불투명도"
              value={drag?.id === active.id ? drag.value : active.opacity}
              onChange={(e) => {
                const value = Number(e.target.value)
                setDrag({ id: active.id, value })
                props.onOpacityPreview(active.id, value)
              }}
              onPointerUp={() => {
                if (drag) props.onOpacity(drag.id, drag.value)
                setDrag(null)
              }}
              onKeyUp={() => {
                if (drag) props.onOpacity(drag.id, drag.value)
                setDrag(null)
              }}
              onBlur={() => {
                if (drag) props.onOpacity(drag.id, drag.value)
                setDrag(null)
              }}
            />
          </label>
          <div className="layer-detail__buttons">
            <button className="btn" onClick={() => props.onRename(active.id)}>
              이름 바꾸기
            </button>
            <button
              className="btn btn--danger"
              disabled={layers.length <= 1}
              onClick={() => props.onDelete(active.id)}
              title={layers.length <= 1 ? '마지막 레이어는 지울 수 없습니다' : '이 레이어 삭제'}
            >
              삭제
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
