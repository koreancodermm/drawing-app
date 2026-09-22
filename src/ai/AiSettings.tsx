import { useState } from 'react'
import { AI_FEATURE_ENABLED, AI_KEY_URL, MIN_AGE } from './config'
import { clearApiKey, getApiKey, hasConsent, revokeConsent, setApiKey, useHasApiKey } from './keyStore'

/** 설정 화면의 AI 영역: API 키 입력·삭제 */
export default function AiSettings() {
  const hasKey = useHasApiKey()
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  if (!AI_FEATURE_ENABLED) return null

  const save = () => {
    if (!draft.trim()) return
    setApiKey(draft)
    setDraft('')
    setMessage(getApiKey() ? 'API 키를 이 기기에 저장했습니다. 그리기 화면에서 AI 도우미를 쓸 수 있습니다.' : '키를 저장하지 못했습니다. 브라우저의 저장소 설정을 확인해 주세요.')
  }

  const remove = () => {
    clearApiKey()
    revokeConsent()
    setMessage('API 키와 동의 기록을 지웠습니다. AI 도우미가 꺼졌습니다.')
  }

  return (
    <section className="settings__block" aria-labelledby="ai-settings-title">
      <h2 id="ai-settings-title">AI 도우미 (선택)</h2>
      <p>
        구글 제미나이에게 그림 아이디어, 색 조합, 그림 피드백을 받을 수 있습니다. 키를 넣지 않으면 AI 기능은 보이지 않고,
        그리기는 그대로 쓸 수 있습니다.
      </p>
      <p className="message message--warn">
        구글 API는 {MIN_AGE}세 이상만 사용할 수 있습니다. AI를 쓸 때만 입력한 글이나 현재 그림이 구글로 전송되며, 무료
        요금제에서는 이 내용이 구글 서비스 개선에 쓰일 수 있습니다.
      </p>
      <p>
        API 키는 <a href={AI_KEY_URL} target="_blank" rel="noreferrer">Google AI Studio</a>에서 본인 이름으로 만들 수 있습니다. 키는 이 기기의
        브라우저에만 저장되며, 남에게 알려 주지 마세요.
      </p>
      <p>
        현재 상태: <strong>{hasKey ? `키 저장됨${hasConsent() ? ' · 안내에 동의함' : ''}` : '키 없음 (AI 꺼짐)'}</strong>
      </p>
      <div className="settings__buttons">
        <input
          type="password"
          className="ai-key-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={hasKey ? '새 키로 바꾸려면 입력' : 'API 키 붙여넣기'}
          autoComplete="off"
          spellCheck={false}
          aria-label="제미나이 API 키"
        />
        <button className="btn btn--primary" disabled={!draft.trim()} onClick={save}>
          키 저장
        </button>
        {hasKey && (
          <button className="btn btn--danger" onClick={remove}>
            키 지우기
          </button>
        )}
      </div>
      {message && (
        <p className="message message--ok" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
