import { useState } from 'react'
import { CATEGORIES, getTool, toolsIn } from '../tools/registry'
import type { ToolCategory } from '../tools/types'
import ToolPreview from './ToolPreview'

interface Props {
  toolId: string
  onSelect: (id: string) => void
}

/** 도구를 여섯 카테고리로 나눠 보여 준다. */
export default function ToolPanel({ toolId, onSelect }: Props) {
  const current = getTool(toolId)
  const [category, setCategory] = useState<ToolCategory>(current?.category ?? 'pen')

  return (
    <nav className="tool-panel" aria-label="도구">
      <div className="tool-tabs" role="tablist" aria-label="도구 종류">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            className="tool-tab"
            aria-selected={category === c.id}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="tool-grid" role="tabpanel">
        {toolsIn(category).map((t) => (
          <button
            key={t.id}
            className="tool-btn"
            aria-pressed={current?.id === t.id}
            title={t.hint}
            onClick={() => onSelect(t.id)}
          >
            <ToolPreview def={t} />
            <span className="tool-btn__label">{t.label}</span>
          </button>
        ))}
      </div>

      {current && <p className="tool-hint">{current.hint}</p>}
    </nav>
  )
}
