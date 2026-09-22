interface Props {
  canPaste: boolean
  scalePercent: number
  angleDeg: number
  flipX: boolean
  flipY: boolean
  onScale: (percent: number) => void
  onAngle: (deg: number) => void
  onFlipX: (on: boolean) => void
  onFlipY: (on: boolean) => void
  onApply: () => void
  onResetTransform: () => void
  transformChanged: boolean
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onClear: () => void
  onDeselect: () => void
}

/** 선택 영역의 복사·잘라내기·붙여넣기와 크기·회전·뒤집기 */
export default function SelectionPanel(p: Props) {
  return (
    <section className="panel-block selection-panel">
      <h2>선택 영역</h2>
      <p className="panel-empty">선택 안에서만 그려집니다. 선택한 레이어의 그림만 다룹니다.</p>

      <div className="file-panel__buttons">
        <button className="btn" onClick={p.onCopy} title="복사 (Ctrl+C)">
          복사
        </button>
        <button className="btn" onClick={p.onCut} title="잘라내기 (Ctrl+X)">
          잘라내기
        </button>
        <button className="btn" onClick={p.onPaste} disabled={!p.canPaste} title="붙여넣기 (Ctrl+V) — 새 레이어로 들어갑니다">
          붙여넣기
        </button>
        <button className="btn" onClick={p.onClear} title="선택 안의 그림 지우기 (Delete)">
          지우기
        </button>
      </div>

      <h3>변형</h3>
      <div className="opt">
        <span>
          크기 <output>{p.scalePercent}%</output>
        </span>
        <input type="range" min={10} max={400} step={5} value={p.scalePercent} aria-label="선택 크기" onChange={(e) => p.onScale(Number(e.target.value))} />
      </div>
      <div className="opt">
        <span>
          회전 <output>{p.angleDeg}°</output>
        </span>
        <input type="range" min={-180} max={180} step={1} value={p.angleDeg} aria-label="선택 회전" onChange={(e) => p.onAngle(Number(e.target.value))} />
      </div>
      <label className="check">
        <input type="checkbox" checked={p.flipX} onChange={(e) => p.onFlipX(e.target.checked)} />
        좌우 뒤집기
      </label>
      <label className="check">
        <input type="checkbox" checked={p.flipY} onChange={(e) => p.onFlipY(e.target.checked)} />
        상하 뒤집기
      </label>
      <div className="file-panel__buttons">
        <button className="btn btn--primary" onClick={p.onApply} disabled={!p.transformChanged}>
          변형 적용
        </button>
        <button className="btn" onClick={p.onResetTransform} disabled={!p.transformChanged}>
          되돌려 놓기
        </button>
      </div>
      <p className="panel-empty">옮기기는 “이동” 도구로 끌어서 합니다.</p>

      <button className="btn" onClick={p.onDeselect}>
        선택 해제
      </button>
    </section>
  )
}
