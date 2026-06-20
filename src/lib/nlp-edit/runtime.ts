// src/lib/nlp-edit/runtime.ts
// 把纯的 createProvider 接到真实浏览器运行时：
//   - 浏览器 dev（localhost:8088）：经 vite 的 /__byok 代理把请求转发到用户的 base_url，绕过浏览器 CORS。
//   - 生产/打包：直连 base_url（后续可换 Tauri http 插件）。
// key 始终只从 localStorage['byok_v1'] 读，本文件不碰 key。
//
// provider.ts 保持纯/可注入；本文件是它的运行时适配层（用到 import.meta.env / window.fetch）。

import { createProvider, type NlpProvider } from './provider';

export function createAppNlpProvider(): NlpProvider {
  const useDevProxy = import.meta.env.DEV;
  return createProvider({
    fetchFn: (input: RequestInfo | URL, init?: RequestInit) => window.fetch(input, init),
    resolveEndpoint: useDevProxy
      ? (base) => ({ url: '/__byok/chat/completions', headers: { 'x-byok-base': base } })
      : undefined, // 直连 `${base}/chat/completions`
  });
}
