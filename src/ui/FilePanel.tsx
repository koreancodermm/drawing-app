import { useRef, useState } from 'react'
import type { ExportFormat } from '../export'
import type { ImportMode } from '../export/importImage'

interface Props {
  disabled?: boolean
  onExport: (format: ExportFormat, options: { transparent: boolean }) => Promise<void>
  onSaveDrawFile: () => Promise<void>
  onImportImage: (file: File, mode: ImportMode) => Promise<void>
}

/** 내보내기(PNG·JPG·PDF), 앱 파일(.draw) 저장, 이미지 불러오기 */
export default function FilePanel({ disabled, onExport, onSaveDrawFile, onImportImage }: Props) {
  const [transparent, setTransparent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const modeRef = useRef<ImportMode>('layer')

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      setMessage({ kind: 'ok', text: `${label} 완료` })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : `${label}에 실패했습니다.` })
    } finally {
      setBusy(false)
    }
  }

  const pickImage = (mode: ImportMode) => {
    modeRef.current = mode
    fileRef.current?.click()
  }

  return (
    <section className="panel-block file-panel">
      <h2>파일</h2>

      <h3>내보내기</h3>
      <div className="file-panel__buttons">
        <button className="btn" disabled={disabled || busy} onClick={() => void run('PNG 내보내기', () => onExport('png', { transparent }))}>
          PNG
        </button>
        <button className="btn" disabled={disabled || busy} onClick={() => void run('JPG 내보내기', () => onExport('jpg', { transparent: false }))}>
          JPG
        </button>
        <button className="btn" disabled={disabled || busy} onClick={() => void run('PDF 내보내기', () => onExport('pdf', { transparent: false }))}>
          PDF
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
        PNG는 배경(종이 색) 없이 투명하게
      </label>

      <h3>이미지 불러오기</h3>
      <div className="file-panel__buttons">
        <button className="btn" disabled={disabled || busy} onClick={() => pickImage('background')}>
          배경으로
        </button>
        <button className="btn" disabled={disabled || busy} onClick={() => pickImage('layer')}>
          새 레이어로
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="이미지 파일 선택"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void run('이미지 불러오기', () => onImportImage(file, modeRef.current))
          e.target.value = ''
        }}
      />

      <h3>앱 파일</h3>
      <div className="file-panel__buttons">
        <button className="btn" disabled={disabled || busy} onClick={() => void run('.draw 파일 저장', onSaveDrawFile)}>
          .draw로 저장
        </button>
      </div>
      <p className="panel-empty">.draw 파일은 홈의 “설정·백업 → 백업 불러오기”에서 다시 열 수 있습니다.</p>

      {message && (
        <p className={`message ${message.kind === 'ok' ? 'message--ok' : 'message--error'}`} role={message.kind === 'ok' ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </section>
  )
}
