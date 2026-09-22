import { useCallback, useEffect, useState } from 'react'
import type { CanvasSpec } from './canvas/paper'
import {
  DrawingLoadError,
  createDrawing,
  getLastOpened,
  getRecentColors,
  listDrawings,
  loadDrawing,
  saveRecentColors,
  setLastOpened,
} from './storage/repository'
import { requestPersistence } from './storage/persist'
import { decodeStroke } from './storage/snapshot'
import DrawingScreen, { type OpenDrawing } from './ui/DrawingScreen'
import Home from './ui/Home'
import Licenses from './ui/Licenses'
import NewDrawing from './ui/NewDrawing'
import Settings from './ui/Settings'

type Screen =
  | { name: 'loading' }
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'settings' }
  | { name: 'licenses' }
  | { name: 'draw'; drawing: OpenDrawing }

async function openFromStorage(id: string): Promise<OpenDrawing> {
  const loaded = await loadDrawing(id)
  return {
    id,
    name: loaded.meta.name,
    spec: loaded.meta.spec,
    ui: loaded.snapshot.ui,
    layers: loaded.snapshot.layers,
    tiles: loaded.tiles,
    strokes: loaded.snapshot.strokes.map(decodeStroke),
    redo: loaded.snapshot.redo.map(decodeStroke),
    recovered: loaded.recovered,
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' })
  const [recentColors, setRecentColors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [defaultName, setDefaultName] = useState('새 그림')

  const openDrawing = useCallback(async (id: string) => {
    try {
      const drawing = await openFromStorage(id)
      await setLastOpened(id)
      setNotice(null)
      setScreen({ name: 'draw', drawing })
    } catch (error) {
      await setLastOpened(null)
      setNotice(
        error instanceof DrawingLoadError
          ? `${error.message} 목록에서 삭제하거나 백업 파일로 복원해 주세요.`
          : '그림을 열지 못했습니다.',
      )
      setScreen({ name: 'home' })
    }
  }, [])

  // 앱을 열면 저장 공간 보호를 요청하고, 마지막으로 그리던 그림을 자동으로 연다.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      void requestPersistence()
      try {
        const colors = await getRecentColors()
        if (!cancelled) setRecentColors(colors)
        const last = await getLastOpened()
        if (last && !cancelled) {
          await openDrawing(last)
          return
        }
      } catch {
        // 저장소를 읽지 못해도 홈 화면은 보여 준다.
      }
      if (!cancelled) setScreen({ name: 'home' })
    })()
    return () => {
      cancelled = true
    }
  }, [openDrawing])

  const onRecentColorsChange = useCallback((colors: string[]) => {
    setRecentColors(colors)
    void saveRecentColors(colors).catch(() => {})
  }, [])

  const goHome = useCallback(async () => {
    await setLastOpened(null).catch(() => {})
    setScreen({ name: 'home' })
  }, [])

  const startNew = async () => {
    let count = 0
    try {
      count = (await listDrawings()).length
    } catch {
      // 이름 번호만 못 매길 뿐이므로 넘어간다.
    }
    setDefaultName(`새 그림 ${count + 1}`)
    setScreen({ name: 'new' })
  }

  const onCreate = async (spec: CanvasSpec, name: string) => {
    const meta = await createDrawing(name, spec)
    await openDrawing(meta.id)
  }

  switch (screen.name) {
    case 'loading':
      return <p className="loading">불러오는 중…</p>
    case 'home':
      return (
        <Home
          notice={notice}
          onOpen={(id) => void openDrawing(id)}
          onNew={() => void startNew()}
          onSettings={() => setScreen({ name: 'settings' })}
        />
      )
    case 'settings':
      return <Settings onBack={() => setScreen({ name: 'home' })} onLicenses={() => setScreen({ name: 'licenses' })} />
    case 'licenses':
      return <Licenses onBack={() => setScreen({ name: 'settings' })} />
    case 'new':
      return (
        <NewDrawing
          defaultName={defaultName}
          onCreate={(spec, name) => void onCreate(spec, name)}
          onCancel={() => setScreen({ name: 'home' })}
        />
      )
    case 'draw':
      return (
        <DrawingScreen
          key={screen.drawing.id}
          drawing={screen.drawing}
          recentColors={recentColors}
          onRecentColorsChange={onRecentColorsChange}
          onHome={() => void goHome()}
        />
      )
  }
}
