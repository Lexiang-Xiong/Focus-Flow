import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import zh from '../locales/zh.json';
import { getSystemLanguage, getSystemLanguageAsync } from './language-utils';

// 同步初始化（使用浏览器 API）
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh }
    },
    // 禁用缓存，只使用 Zustand 里的设置
    detection: {
      order: ['navigator'],
      caches: []
    },
    // 初始语言：根据系统语言自动选择（同步版本）
    lng: getSystemLanguage(),
    // 非中文环境回退到英文
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

// 异步更新语言（使用 Tauri API，更准确）
// 在 Tauri 环境中，这会在初始化后立即执行
if (typeof window.__TAURI__ !== 'undefined') {
  getSystemLanguageAsync().then((lang) => {
    if (lang !== i18n.language) {
      console.log('[i18n] Updating language from Tauri API:', lang);
      i18n.changeLanguage(lang);
    }
  }).catch((e) => {
    console.warn('[i18n] Failed to update language from Tauri API:', e);
  });
}

// 延迟初始化 store 订阅，等待 React 和 store 完全就绪
setTimeout(() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useAppStore } = require('@/store');
    let previousLanguage = useAppStore.getState().settings.language;
    useAppStore.subscribe((state: { settings: { language: string } }) => {
      const currentLanguage = state.settings.language;
      if (currentLanguage !== previousLanguage && currentLanguage) {
        previousLanguage = currentLanguage;
        i18n.changeLanguage(currentLanguage);
      }
    });
  } catch (e) {
    console.warn('Failed to initialize i18n store subscription:', e);
  }
}, 0);

export default i18n;
