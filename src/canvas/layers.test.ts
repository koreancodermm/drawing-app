import { describe, expect, it } from 'vitest'
import {
  FIRST_LAYER_ID,
  MAX_LAYERS,
  applyLayerOp,
  defaultLayers,
  layerOpToStroke,
  layerTileKey,
  maxLayersFor,
  newLayerId,
  nextLayerName,
  normalizeTileMap,
  parseLayerTileKey,
  strokeLayerId,
  strokeToLayerOp,
  type LayerInfo,
  type LayerOp,
} from './layers'

const three = (): LayerInfo[] => [
  { id: 'a', name: 'A', visible: true, opacity: 1, locked: false },
  { id: 'b', name: 'B', visible: true, opacity: 1, locked: false },
  { id: 'c', name: 'C', visible: true, opacity: 1, locked: false },
]

describe('applyLayerOp', () => {
  it('추가는 원하는 자리에 넣고, 이미 있는 아이디는 무시한다', () => {
    const added = applyLayerOp(three(), { op: 'add', id: 'x', name: 'X', index: 1 })
    expect(added.map((l) => l.id)).toEqual(['a', 'x', 'b', 'c'])
    expect(applyLayerOp(added, { op: 'add', id: 'x', name: 'X2', index: 0 })).toHaveLength(4)
    expect(applyLayerOp(three(), { op: 'add', id: 'y', name: 'Y', index: 99 }).at(-1)?.id).toBe('y')
  })

  it('삭제는 마지막 한 장을 남긴다', () => {
    expect(applyLayerOp(three(), { op: 'delete', id: 'b' }).map((l) => l.id)).toEqual(['a', 'c'])
    expect(applyLayerOp(defaultLayers(), { op: 'delete', id: FIRST_LAYER_ID })).toHaveLength(1)
    expect(applyLayerOp(three(), { op: 'delete', id: '없음' })).toHaveLength(3)
  })

  it('순서 바꾸기', () => {
    expect(applyLayerOp(three(), { op: 'move', id: 'a', index: 2 }).map((l) => l.id)).toEqual(['b', 'c', 'a'])
    expect(applyLayerOp(three(), { op: 'move', id: 'c', index: 0 }).map((l) => l.id)).toEqual(['c', 'a', 'b'])
  })

  it('보이기·잠금·이름·불투명도(0~1로 제한)를 바꾼다', () => {
    let l = applyLayerOp(three(), { op: 'set', id: 'b', key: 'visible', value: false })
    l = applyLayerOp(l, { op: 'set', id: 'b', key: 'locked', value: true })
    l = applyLayerOp(l, { op: 'set', id: 'b', key: 'name', value: '배경' })
    l = applyLayerOp(l, { op: 'set', id: 'b', key: 'opacity', value: 7 })
    expect(l[1]).toMatchObject({ visible: false, locked: true, name: '배경', opacity: 1 })
    expect(applyLayerOp(l, { op: 'set', id: 'b', key: 'opacity', value: -2 })[1].opacity).toBe(0)
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const src = three()
    applyLayerOp(src, { op: 'delete', id: 'a' })
    applyLayerOp(src, { op: 'set', id: 'a', key: 'name', value: '바뀜' })
    expect(src.map((l) => l.name)).toEqual(['A', 'B', 'C'])
  })
})

describe('레이어 조작 <-> 획', () => {
  const ops: LayerOp[] = [
    { op: 'add', id: 'n', name: '새 레이어', index: 2 },
    { op: 'delete', id: 'n' },
    { op: 'move', id: 'a', index: 1 },
    { op: 'set', id: 'a', key: 'visible', value: false },
    { op: 'set', id: 'a', key: 'locked', value: true },
    { op: 'set', id: 'a', key: 'opacity', value: 0.35 },
    { op: 'set', id: 'a', key: 'name', value: '이름' },
  ]

  for (const op of ops) {
    it(`${op.op}${'key' in op ? '/' + op.key : ''}는 저장 가능한 획으로 바뀌었다 돌아온다`, () => {
      const stroke = layerOpToStroke(op)
      expect(stroke.tool).toBe('_layer')
      // JSON으로 저장했다 읽어도 같은 조작이어야 한다.
      const again = { ...stroke, opts: JSON.parse(JSON.stringify(stroke.opts)) }
      expect(strokeToLayerOp(again)).toEqual(op)
    })
  }

  it('레이어 조작이 아닌 획은 null', () => {
    expect(strokeToLayerOp({ tool: 'ballpoint', color: '#000', size: 1, points: [] })).toBeNull()
  })
})

describe('그리는 레이어와 타일 키', () => {
  it('opts.layer가 없는 옛 획은 첫 레이어에 그려진다', () => {
    expect(strokeLayerId({ tool: 'x', color: '', size: 1, points: [] })).toBe(FIRST_LAYER_ID)
    expect(strokeLayerId({ tool: 'x', color: '', size: 1, points: [], opts: { layer: 'Q' } })).toBe('Q')
  })

  it('타일 키를 만들고 읽는다(예전 형식은 첫 레이어)', () => {
    expect(parseLayerTileKey(layerTileKey('Lx', 3, 4))).toEqual({ layer: 'Lx', tx: 3, ty: 4 })
    expect(parseLayerTileKey('2,5')).toEqual({ layer: FIRST_LAYER_ID, tx: 2, ty: 5 })
    expect(normalizeTileMap({ '0,0': 1, 'B|1,1': 2 })).toEqual({ 'L0|0,0': 1, 'B|1,1': 2 })
  })

  it('레이어 아이디는 겹치지 않고, 이름은 비어 있는 번호로 붙는다', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newLayerId()))
    expect(ids.size).toBe(200)
    expect(nextLayerName(defaultLayers())).toBe('레이어 2')
    expect(nextLayerName([{ ...defaultLayers()[0], name: '레이어 2' }])).toBe('레이어 3')
  })
})

describe('maxLayersFor', () => {
  it('작은 용지는 30개, 큰 용지는 메모리 때문에 더 적다', () => {
    expect(maxLayersFor(1240, 1754)).toBeGreaterThanOrEqual(20)
    expect(maxLayersFor(1240, 1754)).toBeLessThanOrEqual(MAX_LAYERS)
    expect(maxLayersFor(400, 300)).toBe(MAX_LAYERS)
    const b2 = maxLayersFor(2953, 4175)
    expect(b2).toBeLessThan(maxLayersFor(1240, 1754))
    expect(b2).toBeGreaterThanOrEqual(2)
  })
})
