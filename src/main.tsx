import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/i18n'
import './index.css'
import App from './App.tsx'
import { useAppStore } from '@/store'

// 仅 dev：把 store 暴露到 window，供 E2E（Playwright）注入测试 fixture（建分区/任务）。生产构建不包含此分支。
if (import.meta.env.DEV) {
  ;(window as unknown as { __appStore?: typeof useAppStore }).__appStore = useAppStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
