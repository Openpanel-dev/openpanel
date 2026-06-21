import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './resources/en.json';
import zhCN from './resources/zh-CN.json';
import zhTW from './resources/zh-TW.json';
import {
  defaultLanguage,
  normalizeLanguage,
} from './locales';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
      'zh-TW': { translation: zhTW },
    },
    fallbackLng: defaultLanguage,
    load: 'currentOnly',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'openpanel-language',
      convertDetectedLanguage: normalizeLanguage,
    },
  });

if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window, { __openpanelI18n: i18n });
}

export default i18n;
