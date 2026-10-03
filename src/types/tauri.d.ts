// Tauri 环境类型声明
declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export {};
