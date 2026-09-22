import { useState } from 'react'
import { promptInstall, useInstallState } from '../pwa/install'
import { applyUpdate, useUpdateAvailable } from '../pwa/register'

/** 새 버전이 준비됐을 때 위쪽에 띄우는 알림. 누르기 전까지 앱은 바뀌지 않는다. */
export function UpdateBanner() {
  const available = useUpdateAvailable()
  if (!available) return null
  return (
    <div className="message message--ok update-banner" role="status">
      <span>새 버전이 준비되었습니다. 그림은 그대로 남습니다.</span>
      <button className="btn btn--primary" onClick={applyUpdate}>
        지금 업데이트
      </button>
    </div>
  )
}

/** 앱으로 설치하는 버튼과, 버튼이 없는 환경(아이폰·아이패드 등)을 위한 설명 */
export function InstallGuide() {
  const { installed, canPrompt, ios } = useInstallState()
  const [message, setMessage] = useState<string | null>(null)

  if (installed) return null

  const install = async () => {
    const result = await promptInstall()
    if (result === 'accepted') setMessage('설치했습니다. 홈 화면이나 앱 목록에서 열 수 있어요.')
    else if (result === 'dismissed') setMessage('설치를 취소했습니다. 언제든 다시 할 수 있어요.')
  }

  return (
    <section className="install-guide" aria-label="앱으로 설치하기">
      <h2>앱으로 설치하기</h2>
      <p>설치하면 주소창 없이 앱처럼 열리고, 인터넷이 없어도 그릴 수 있습니다.</p>
      {canPrompt && (
        <button className="btn btn--primary" onClick={() => void install()}>
          앱으로 설치
        </button>
      )}
      {message && (
        <p className="message message--ok" role="status">
          {message}
        </p>
      )}
      <details open={!canPrompt}>
        <summary>홈 화면에 추가하는 방법</summary>
        <ul>
          <li>
            <strong>안드로이드(크롬)</strong>: 오른쪽 위 ⋮ 메뉴 → “앱 설치” 또는 “홈 화면에 추가”.
          </li>
          <li>
            <strong>아이폰·아이패드(사파리)</strong>: 아래(또는 위)의 공유 버튼 → “홈 화면에 추가”.
            {ios && ' 지금 쓰는 기기가 이 방법입니다.'}
          </li>
          <li>
            <strong>컴퓨터(크롬·엣지)</strong>: 주소창 오른쪽의 설치 아이콘을 누르거나 메뉴에서 “앱 설치”.
          </li>
        </ul>
      </details>
    </section>
  )
}
