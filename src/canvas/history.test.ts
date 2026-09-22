import { describe, expect, it } from 'vitest'
import { UndoHistory } from './history'

describe('UndoHistory', () => {
  it('되돌리기와 다시하기가 순서대로 동작한다', () => {
    const h = new UndoHistory<number>(100)
    h.push(1)
    h.push(2)
    expect(h.undo()).toBe(2)
    expect(h.canRedo).toBe(true)
    expect(h.redo()).toBe(2)
    expect(h.undoable).toEqual([1, 2])
  })

  it('새 항목을 넣으면 다시하기 기록이 지워진다', () => {
    const h = new UndoHistory<number>(100)
    h.push(1)
    h.undo()
    h.push(2)
    expect(h.canRedo).toBe(false)
  })

  it('비어 있으면 undo/redo가 undefined를 돌려준다', () => {
    const h = new UndoHistory<number>(100)
    expect(h.undo()).toBeUndefined()
    expect(h.redo()).toBeUndefined()
    expect(h.canUndo).toBe(false)
  })

  it('100단계를 넘으면 가장 오래된 항목을 밀어내고 onEvict로 넘긴다', () => {
    const evicted: number[] = []
    const h = new UndoHistory<number>(100, (n) => evicted.push(n))
    for (let i = 0; i < 105; i++) h.push(i)
    expect(h.undoable).toHaveLength(100)
    expect(evicted).toEqual([0, 1, 2, 3, 4])
    for (let i = 0; i < 100; i++) h.undo()
    expect(h.canUndo).toBe(false)
  })
})
