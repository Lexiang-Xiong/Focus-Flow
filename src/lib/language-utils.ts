// 检测系统语言：中文环境返回 'zh'，其他环境返回 'en'
// 支持 Tauri 桌面环境和浏览器环境

/**
 * 从 Tauri API 获取系统语言
 * 仅在 Tauri 桌面环境中可用
 */
async function getTauriSystemLocale(): Promise<string | null> {
  // 检测是否在 Tauri 环境中
  if (typeof window.__TAURI__ === 'undefined') {
    return null;
  }

  try {
    // 动态导入 Tauri OS API
    const { locale } = await import('@tauri-apps/api/os');
    const systemLocale = await locale();
    console.log('[Language] Tauri system locale:', systemLocale);
    return systemLocale;
  } catch (e) {
    console.warn('[Language] Failed to get Tauri locale:', e);
    return null;
  }
}

/**
 * 从浏览器 API 获取系统语言
 */
function getBrowserLanguage(): string {
  const systemLang = navigator.language || navigator.languages?.[0] || 'en';
  console.log('[Language] Browser language:', systemLang);
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
 * 同步版本：检测系统语言（用于初始化）
 * 优先使用 Tauri API，备选浏览器 API
 */
export const getSystemLanguage = (): string => {
  // 在 Tauri 环境中，优先使用 Tauri API（但这个是异步的，所以先用浏览器 API）
  // 在浏览器环境中，直接使用 navigator.language
  const systemLang = getBrowserLanguage();
  return normalizeLanguage(systemLang);
};

/**
 * 异步版本：检测系统语言（更准确，推荐使用）
 * 在 Tauri 环境中使用 Tauri API，在浏览器中使用 navigator.language
 */
export const getSystemLanguageAsync = async (): Promise<string> => {
  // 优先尝试 Tauri API
  const tauriLocale = await getTauriSystemLocale();
  if (tauriLocale) {
    return normalizeLanguage(tauriLocale);
  }

  // 备选浏览器 API
  const browserLang = getBrowserLanguage();
  return normalizeLanguage(browserLang);
};

/**
 * 获取详细的语言信息（用于调试）
 */
export const getLanguageInfo = async () => {
  const tauriLocale = await getTauriSystemLocale();
  const browserLang = getBrowserLanguage();
  const detected = getSystemLanguage();
  const detectedAsync = await getSystemLanguageAsync();

  return {
    tauriLocale,
    browserLanguage: browserLang,
    browserLanguages: navigator.languages,
    detectedSync: detected,
    detectedAsync,
    isTauriEnv: typeof window.__TAURI__ !== 'undefined',
  };
};
