// 检测系统语言：中文环境返回 'zh'，其他所有情况返回 'en'
// 策略：英文是绝对默认，只有明确识别到中文系统时才使用中文

/**
 * 从浏览器 API 获取系统语言（带异常处理）
 * 在 Tauri WebView 中，navigator.language 会返回系统语言
 * 任何异常情况下都返回 'en'（保底策略）
 */
function getBrowserLanguage(): string {
  try {
    // 尝试获取系统语言
    const systemLang = navigator.language || navigator.languages?.[0];
    
    // 如果无法获取或为空，返回 'en'
    if (!systemLang || typeof systemLang !== 'string') {
      console.warn('[Language] No valid system language detected, defaulting to English');
      return 'en';
    }
    
    console.log('[Language] System language detected:', systemLang);
    return systemLang;
  } catch (error) {
    // 任何异常都返回英文（保底策略）
    console.error('[Language] Error detecting system language, defaulting to English:', error);
    return 'en';
  }
}

/**
 * 规范化语言代码：判断是否中文环境（保守策略）
 * @param lang 语言代码（如 'zh-CN', 'en-US'）
 * @returns 'zh' 或 'en'
 * 
 * 规则：
 * - 明确以 'zh' 开头 → 'zh'（中文）
 * - 其他任何情况 → 'en'（英文，包括空值、异常值、其他语言）
 */
function normalizeLanguage(lang: string): string {
  try {
    // 确保输入是有效字符串
    if (!lang || typeof lang !== 'string') {
      console.warn('[Language] Invalid language code, defaulting to English:', lang);
      return 'en';
    }
    
    // 只有在明确识别为中文时才返回 'zh'
    // 支持：zh-CN, zh-TW, zh-HK, zh-SG, zh-MO 等
    const normalized = lang.toLowerCase().trim();
    if (normalized.startsWith('zh')) {
      console.log('[Language] Chinese locale detected:', lang);
      return 'zh';
    }
    
    // 其他所有情况默认英文
    console.log('[Language] Non-Chinese locale, using English:', lang);
    return 'en';
  } catch (error) {
    // 任何异常都返回英文（保底策略）
    console.error('[Language] Error normalizing language, defaulting to English:', error);
    return 'en';
  }
}

/**
 * 检测系统语言（同步版本）
 * 使用 navigator.language，在 Tauri WebView 中会返回系统语言
 * 
 * 保底策略：
 * - 明确识别中文 → 'zh'
 * - 其他任何情况（包括异常）→ 'en'
 */
export const getSystemLanguage = (): string => {
  try {
    const systemLang = getBrowserLanguage();
    const normalized = normalizeLanguage(systemLang);
    console.log('[Language] Final language selection:', normalized);
    return normalized;
  } catch (error) {
    // 终极保底：任何未预期的异常都返回英文
    console.error('[Language] Unexpected error in language detection, defaulting to English:', error);
    return 'en';
  }
};

/**
 * 检测系统语言（异步版本，与同步版本相同）
 * 保留此函数以保持 API 一致性
 */
export const getSystemLanguageAsync = async (): Promise<string> => {
  try {
    return getSystemLanguage();
  } catch (error) {
    console.error('[Language] Error in async language detection, defaulting to English:', error);
    return 'en';
  }
};

/**
 * 获取详细的语言信息（用于调试）
 */
export const getLanguageInfo = async () => {
  try {
    const browserLang = getBrowserLanguage();
    const detected = getSystemLanguage();

    return {
      browserLanguage: browserLang,
      browserLanguages: navigator.languages || [],
      detected,
      isTauriEnv: typeof (window as any).__TAURI__ !== 'undefined',
      userAgent: navigator.userAgent || 'unknown',
    };
  } catch (error) {
    console.error('[Language] Error getting language info:', error);
    return {
      browserLanguage: 'unknown',
      browserLanguages: [],
      detected: 'en',
      isTauriEnv: false,
      userAgent: 'unknown',
      error: String(error),
    };
  }
};

/**
 * 测试函数：验证各种语言代码的检测结果
 * 用于调试和测试
 */
export const testLanguageDetection = () => {
  const testCases = [
    // 中文环境（应该返回 'zh'）
    'zh-CN', 'zh-TW', 'zh-HK', 'zh-SG', 'zh-MO', 'zh',
    'ZH-CN', 'Zh-Tw', // 大小写测试
    
    // 英文环境（应该返回 'en'）
    'en-US', 'en-GB', 'en', 'English',
    
    // 其他语言（应该返回 'en'）
    'ja-JP', 'ko-KR', 'fr-FR', 'de-DE', 'es-ES', 'ru-RU',
    
    // 异常值（应该返回 'en'）
    '', null, undefined, 'invalid', 'x-custom', '123',
  ];
  
  console.log('\n=== 语言检测测试 ===');
  console.log('输入 → 输出 | 预期 | 结果');
  console.log('─'.repeat(50));
  
  testCases.forEach(testCase => {
    const result = normalizeLanguage(testCase as string);
    const expected = String(testCase).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const passed = result === expected;
    const icon = passed ? '✅' : '❌';
    
    console.log(
      `${icon} ${String(testCase).padEnd(15)} → ${result.padEnd(3)} | 预期: ${expected} | ${passed ? '通过' : '失败'}`
    );
  });
  
  console.log('─'.repeat(50));
  console.log('测试完成\n');
};
