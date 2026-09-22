import { useState } from 'react'
import { MIN_AGE } from './config'

interface Props {
  onAgree: () => void
  onCancel: () => void
}

/** 처음 AI를 쓸 때 한 번 뜨는 안내. 동의해야만 진행된다. */
export default function AiConsent({ onAgree, onCancel }: Props) {
  const [adult, setAdult] = useState(false)
  return (
    <div className="ai-modal" role="presentation">
      <div className="ai-modal__box" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
        <h2 id="ai-consent-title">AI를 쓰기 전에 확인해 주세요</h2>
        <ul className="ai-modal__list">
          <li>그림은 기기에만 저장되고, AI를 쓸 때만 내용이 구글로 전송됩니다.</li>
          <li>무료 요금제는 입력이 구글 서비스 개선에 쓰일 수 있습니다.</li>
          <li>구글 API는 {MIN_AGE}세 이상만 사용할 수 있습니다.</li>
        </ul>
        <label className="check">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          저는 만 {MIN_AGE}세 이상이며 위 내용을 이해했습니다.
        </label>
        <div className="ai-modal__buttons">
          <button className="btn" onClick={onCancel}>
            취소
          </button>
          <button className="btn btn--primary" disabled={!adult} onClick={onAgree}>
            동의하고 시작
          </button>
        </div>
      </div>
    </div>
  )
}
