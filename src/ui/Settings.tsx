import { useEffect, useRef, useState } from 'react'
import { BACKUP_EXTENSION, createBackup, restoreBackup } from '../storage/backup'
import { aiPlugin } from './aiHost'
import ThemeToggle from './ThemeToggle'
import {
  getStorageEstimate,
  isPersisted,
  requestPersistence,
  type StorageEstimate,
} from '../storage/persist'

interface Props {
  onBack: () => void
  onLicenses: () => void
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function todayStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

export default function Settings({ onBack, onLicenses }: Props) {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void isPersisted().then(setPersisted)
    void getStorageEstimate().then(setEstimate)
  }, [])

  const onExport = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const { bytes, count, skipped } = await createBackup()
      if (count === 0) {
        setMessage({ kind: 'error', text: '백업할 그림이 없습니다.' })
      } else {
        downloadBytes(bytes, `그림-백업-${todayStamp()}.${BACKUP_EXTENSION}`)
        const extra = skipped.length > 0 ? ` (손상되어 담지 못한 그림: ${skipped.join(', ')})` : ''
        setMessage({ kind: 'ok', text: `그림 ${count}개를 백업 파일로 내보냈습니다.${extra}` })
      }
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '백업 파일을 만들지 못했습니다.',
      })
    } finally {
      setBusy(false)
    }
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const { imported, failed } = await restoreBackup(new Uint8Array(await file.arrayBuffer()))
      const extra = failed > 0 ? ` ${failed}개는 손상되어 불러오지 못했습니다.` : ''
      setMessage({
        kind: imported > 0 ? 'ok' : 'error',
        text: `그림 ${imported}개를 불러왔습니다.${extra}`,
      })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '백업 파일을 불러오지 못했습니다.',
      })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onPersist = async () => {
    setPersisted(await requestPersistence())
  }

  return (
    <main className="settings">
      <header className="home__header">
        <h1>설정·백업</h1>
        <button className="btn" onClick={onBack}>
          홈으로
        </button>
      </header>

      <section className="settings__block">
        <h2>화면 테마</h2>
        <p>라이트, 다크, 기기 설정 따르기 중에서 고를 수 있습니다.</p>
        <ThemeToggle />
      </section>

      {aiPlugin && <aiPlugin.SettingsSection />}

      <section className="settings__block">
        <h2>정보</h2>
        <div className="settings__buttons">
          <a className="btn" href="./privacy.html" target="_blank" rel="noreferrer">
            개인정보처리방침
          </a>
          <button className="btn" onClick={onLicenses}>
            오픈소스 고지
          </button>
        </div>
      </section>

      <section className="settings__block">
        <h2>저장 위치 안내</h2>
        <p className="message message--warn">
          그림은 이 기기의 브라우저 안에만 저장됩니다. 브라우저의 “사이트 데이터 삭제”를 누르거나
          기기를 바꾸면 그림도 함께 사라지니, 중요한 그림은 아래 백업 파일로 보관해 주세요.
        </p>
        <p>
          저장 공간 보호:{' '}
          <strong>
            {persisted === null ? '확인 중…' : persisted ? '켜짐 (브라우저가 마음대로 지우지 않음)' : '꺼짐'}
          </strong>
        </p>
        {persisted === false && (
          <button className="btn" onClick={() => void onPersist()}>
            저장 공간 보호 요청
          </button>
        )}
        {estimate && (
          <p>
            사용 중인 저장 공간: {formatMb(estimate.usage)} / 사용 가능 {formatMb(estimate.quota)}
          </p>
        )}
      </section>

      <section className="settings__block">
        <h2>백업</h2>
        <p>모든 그림을 파일 하나로 내보내고, 나중에 다시 불러올 수 있습니다.</p>
        <div className="settings__buttons">
          <button className="btn btn--primary" disabled={busy} onClick={() => void onExport()}>
            백업 내보내기
          </button>
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            백업 불러오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={`.${BACKUP_EXTENSION},.draw`}
            hidden
            aria-label="백업 파일 선택"
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
        </div>
        <p className="settings__hint">
          불러오면 기존 그림은 그대로 두고 백업의 그림이 새 그림으로 추가됩니다.
        </p>
        {message && (
          <p
            className={`message ${message.kind === 'ok' ? 'message--ok' : 'message--error'}`}
            role={message.kind === 'ok' ? 'status' : 'alert'}
          >
            {message.text}
          </p>
        )}
      </section>
    </main>
  )
}
