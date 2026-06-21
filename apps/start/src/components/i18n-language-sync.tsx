import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from '@/i18n/locales';

function getInitialClientLanguage() {
  const storedLanguage = window.localStorage.getItem('openpanel-language');
  if (storedLanguage) {
    return normalizeLanguage(storedLanguage);
  }

  return normalizeLanguage(window.navigator.language);
}

export function I18nLanguageSync() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const language = getInitialClientLanguage();
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [i18n]);

  useEffect(() => {
    const handleLanguageChanged = (language: string) => {
      document.documentElement.lang = normalizeLanguage(language);
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => i18n.off('languageChanged', handleLanguageChanged);
  }, [i18n]);

  return null;
}
