// 检测系统语言：中文环境返回 'zh'，其他环境返回 'en'
export const getSystemLanguage = (): string => {
  // 浏览器/Tauri 环境
  const systemLang = navigator.language || navigator.languages?.[0] || 'en';
  
  // 如果是中文环境（zh-CN, zh-TW, zh-HK 等），返回 'zh'
  if (systemLang.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  
  // 其他环境默认英文
  return 'en';
};
