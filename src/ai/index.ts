import type { AiPlugin } from '../ui/aiHost'
import './ai.css'
import AiPanel from './AiPanel'
import AiSettings from './AiSettings'

/** 앱이 AI 기능을 붙이는 입구. 이 폴더(src/ai)를 지우면 앱에서 AI 화면이 사라진다. */
export const aiPlugin: AiPlugin = {
  SettingsSection: AiSettings,
  Panel: AiPanel,
}
