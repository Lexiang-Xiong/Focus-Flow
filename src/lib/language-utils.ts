// 检测系统语言：中文环境返回 'zh'，其他环境返回 'en'
// 支持 Tauri 桌面环境和浏览器环境

/**
 * 从浏览器 API 获取系统语言
 * 在 Tauri WebView 中，navigator.language 会返回系统语言
 */
function getBrowserLanguage(): string {
  const systemLang = navigator.language || navigator.languages?.[0] || 'en';
  console.log('[Language] System language:', systemLang);
  return systemLang;
}

/**
 * 规范化语言代码：判断是否中文环境
 * @param lang 语言代码（如 'zh-CN', 'en-US'）
 * @returns 'zh' 或 'en'
 */
function normalizeLanguage(lang: string): string {
  // 如果是中文环境（zh-CN, zh-TW, zh-HK 等），返回 'zh'
  if (lang.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  
  // 其他环境默认英文
  return 'en';
}

/**
 * 检测系统语言（同步版本）
 * 使用 navigator.language，在 Tauri WebView 中会返回系统语言
 */
export const getSystemLanguage = (): string => {
  const systemLang = getBrowserLanguage();
  return normalizeLanguage(systemLang);
};

/**
 * 检测系统语言（异步版本，与同步版本相同）
 * 保留此函数以保持 API 一致性
 */
export const getSystemLanguageAsync = async (): Promise<string> => {
  return getSystemLanguage();
};

/**
 * 获取详细的语言信息（用于调试）
 */
export const getLanguageInfo = async () => {
  const browserLang = getBrowserLanguage();
  const detected = getSystemLanguage();

  return {
    browserLanguage: browserLang,
    browserLanguages: navigator.languages,
    detected,
    isTauriEnv: typeof window.__TAURI__ !== 'undefined',
    userAgent: navigator.userAgent,
  };
};
