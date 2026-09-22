/**
 * 되돌리기 기록. 최근 limit개까지만 되돌릴 수 있고,
 * 한도를 넘어 밀려난 항목은 onEvict로 넘긴다.
 */
export class UndoHistory<T> {
  private items: T[] = []
  private redoItems: T[] = []
  private readonly limit: number
  private readonly onEvict: ((item: T) => void) | undefined
  private readonly onDrop: ((item: T) => void) | undefined

  /**
   * onEvict: 한도를 넘어 되돌릴 수 없게 된 가장 오래된 항목
   * onDrop: 새 항목을 넣는 바람에 다시하기 목록에서 버려지는 항목
   */
  constructor(limit: number, onEvict?: (item: T) => void, onDrop?: (item: T) => void) {
    this.limit = limit
    this.onEvict = onEvict
    this.onDrop = onDrop
  }

  get undoable(): readonly T[] {
    return this.items
  }

  /** 다시하기 대기열. 가장 먼저 다시 실행할 항목이 맨 끝에 있다. */
  get redoable(): readonly T[] {
    return this.redoItems
  }

  get canUndo(): boolean {
    return this.items.length > 0
  }

  get canRedo(): boolean {
    return this.redoItems.length > 0
  }

  /** 저장해 둔 기록을 그대로 되살린다(밀려난 항목 처리는 하지 않는다). */
  restore(items: readonly T[], redoItems: readonly T[]): void {
    this.items = items.slice(-this.limit)
    this.redoItems = [...redoItems]
  }

  push(item: T): void {
    this.items.push(item)
    const dropped = this.redoItems
    this.redoItems = []
    for (const d of dropped) this.onDrop?.(d)
    this.trim()
  }

  undo(): T | undefined {
    const item = this.items.pop()
    if (item !== undefined) this.redoItems.push(item)
    return item
  }

  redo(): T | undefined {
    const item = this.redoItems.pop()
    if (item !== undefined) {
      this.items.push(item)
      this.trim()
    }
    return item
  }

  private trim(): void {
    while (this.items.length > this.limit) {
      const evicted = this.items.shift()
      if (evicted !== undefined) this.onEvict?.(evicted)
    }
  }
}
