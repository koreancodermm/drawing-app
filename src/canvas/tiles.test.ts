import { describe, expect, it } from 'vitest'
import { TILE_SIZE, parseTileKey, tileKey, tilesInBounds } from './tiles'

describe('타일 키', () => {
  it('만들고 다시 읽는다', () => {
    expect(parseTileKey(tileKey(3, 12))).toEqual({ tx: 3, ty: 12 })
  })
})

describe('tilesInBounds', () => {
  it('영역이 걸친 모든 타일을 돌려준다', () => {
    const tiles = tilesInBounds({ x0: 250, y0: 10, x1: 260, y1: 20 }, 1000, 1000)
    expect(tiles).toEqual([
      { tx: 0, ty: 0 },
      { tx: 1, ty: 0 },
    ])
  })

  it('캔버스 밖은 자른다', () => {
    const tiles = tilesInBounds({ x0: -50, y0: -50, x1: 10, y1: 10 }, 1000, 1000)
    expect(tiles).toEqual([{ tx: 0, ty: 0 }])
    expect(tilesInBounds({ x0: 2000, y0: 0, x1: 2100, y1: 10 }, 1000, 1000)).toEqual([])
  })

  it('캔버스 가장자리 타일은 캔버스보다 좁아도 하나로 센다', () => {
    const width = TILE_SIZE + 10
    const tiles = tilesInBounds({ x0: TILE_SIZE + 2, y0: 0, x1: TILE_SIZE + 8, y1: 5 }, width, 100)
    expect(tiles).toEqual([{ tx: 1, ty: 0 }])
  })
})
