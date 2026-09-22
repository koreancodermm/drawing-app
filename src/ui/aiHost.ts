import type { ComponentType } from 'react'
import { aiPlugin as loaded } from 'virtual:ai-plugin'

/**
 * AI 기능이 앱에 끼워지는 자리. AI 코드는 `src/ai`에만 있고, 이 폴더가 없거나 스위치(VITE_AI_ENABLED=false)가 꺼져 있으면 `aiPlugin`은 null이며 AI 코드는 배포 파일에 들어가지 않는다(vite.config.ts의 aiFeaturePlugin).
 * (그리기 화면과 설정은 이 파일만 알고 `src/ai`는 직접 가져오지 않는다.)
 */
export interface AiPanelProps {
  /** 지금 그림(보이는 레이어를 합친 것)을 캔버스로 돌려준다 */
  getCanvas: () => HTMLCanvasElement | null
  /** 팔레트에 색을 넣는다 */
  onAddColors: (colors: string[]) => void
}

export interface AiPlugin {
  /** 설정 화면의 AI 영역(키 입력) */
  SettingsSection: ComponentType
  /** 그리기 화면의 제안 패널. 키가 없거나 기능이 꺼져 있으면 아무것도 그리지 않는다. */
  Panel: ComponentType<AiPanelProps>
}

export const aiPlugin: AiPlugin | null = loaded
