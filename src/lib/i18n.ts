import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import zh from '../locales/zh.json';

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
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false
    }
  });

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
