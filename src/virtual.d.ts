// vite.config.ts의 aiFeaturePlugin이 만드는 가상 모듈
declare module 'virtual:ai-plugin' {
  import type { AiPlugin } from './ui/aiHost'
  export const aiPlugin: AiPlugin | null
}
