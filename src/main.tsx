import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { listenForInstall } from './pwa/install'
import { registerServiceWorker } from './pwa/register'
import { applyTheme, getStoredTheme } from './ui/theme'

// 화면이 그려지기 전에 저장된 테마를 적용해서 깜빡임을 막는다.
applyTheme(getStoredTheme())

// 설치 이벤트를 놓치지 않게 먼저 듣고, 서비스 워커(오프라인 실행)를 등록한다.
listenForInstall()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
