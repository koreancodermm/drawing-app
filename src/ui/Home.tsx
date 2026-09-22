import { useEffect, useMemo, useState } from 'react'
import { InstallGuide, UpdateBanner } from './InstallGuide'
import {
  deleteDrawing,
  duplicateDrawing,
  listDrawings,
  renameDrawing,
  type DrawingListItem,
} from '../storage/repository'

interface Props {
  onOpen: (id: string) => void
  onNew: () => void
  onSettings: () => void
  /** 다른 화면에서 넘어온 안내 문구 */
  notice?: string | null
}

function formatDate(time: number): string {
  return new Date(time).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function Home({ onOpen, onNew, onSettings, notice }: Props) {
  const [items, setItems] = useState<DrawingListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 값이 바뀌면 목록을 다시 불러온다.
  const [version, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)

  useEffect(() => {
    let cancelled = false
    listDrawings()
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch(() => {
        if (cancelled) return
        setError('그림 목록을 불러오지 못했습니다.')
        setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [version])

  // 썸네일 이미지 주소는 목록이 바뀔 때마다 새로 만들고, 쓰던 것은 해제한다.
  const thumbUrls = useMemo(() => {
    const urls: Record<string, string> = {}
    for (const item of items ?? []) {
      if (item.thumbnail) {
        urls[item.meta.id] = URL.createObjectURL(new Blob([item.thumbnail], { type: 'image/png' }))
      }
    }
    return urls
  }, [items])

  useEffect(() => {
    return () => Object.values(thumbUrls).forEach((u) => URL.revokeObjectURL(u))
  }, [thumbUrls])

  const run = async (action: () => Promise<unknown>, failMessage: string) => {
    setError(null)
    try {
      await action()
    } catch {
      setError(failMessage)
    }
    refresh()
  }

  const onRename = (item: DrawingListItem) => {
    const next = window.prompt('새 이름을 입력해 주세요.', item.meta.name)?.trim()
    if (next && next !== item.meta.name) {
      void run(() => renameDrawing(item.meta.id, next), '이름을 바꾸지 못했습니다.')
    }
  }

  const onDuplicate = (item: DrawingListItem) =>
    void run(
      () => duplicateDrawing(item.meta.id, `${item.meta.name} 복사본`),
      '그림을 복제하지 못했습니다. 저장 데이터가 손상됐을 수 있습니다.',
    )

  const onDelete = (item: DrawingListItem) => {
    if (window.confirm(`"${item.meta.name}" 그림을 삭제할까요? 삭제한 그림은 되돌릴 수 없습니다.`)) {
      void run(() => deleteDrawing(item.meta.id), '그림을 삭제하지 못했습니다.')
    }
  }

  return (
    <main className="home">
      <header className="home__header">
        <h1>내 그림</h1>
        <div className="home__actions">
          <button className="btn" onClick={onSettings}>
            설정·백업
          </button>
          <button className="btn btn--primary" onClick={onNew}>
            새 그림
          </button>
        </div>
      </header>

      <UpdateBanner />
      {notice && (
        <p className="message message--warn" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="message message--error" role="alert">
          {error}
        </p>
      )}

      {items === null ? (
        <p>불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="home__empty">아직 그림이 없습니다. “새 그림”을 눌러 시작해 보세요.</p>
      ) : (
        <ul className="gallery">
          {items.map((item) => (
            <li key={item.meta.id} className="card">
              <button
                className="card__open"
                onClick={() => onOpen(item.meta.id)}
                aria-label={`${item.meta.name} 열기`}
              >
                <span className="card__thumb" style={{ background: item.meta.spec.background }}>
                  {thumbUrls[item.meta.id] ? (
                    <img src={thumbUrls[item.meta.id]} alt={`${item.meta.name} 미리보기`} />
                  ) : (
                    <span className="card__placeholder">미리보기 없음</span>
                  )}
                </span>
                <span className="card__name">{item.meta.name}</span>
                <span className="card__meta">
                  {item.meta.spec.widthPx} × {item.meta.spec.heightPx}px · {formatDate(item.meta.updatedAt)}
                </span>
              </button>
              <div className="card__actions">
                <button className="btn" onClick={() => onRename(item)}>
                  이름 바꾸기
                </button>
                <button className="btn" onClick={() => onDuplicate(item)}>
                  복제
                </button>
                <button className="btn btn--danger" onClick={() => onDelete(item)}>
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <InstallGuide />
    </main>
  )
}
