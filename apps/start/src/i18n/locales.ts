export const supportedLanguages = ['en', 'zh-CN', 'zh-TW'] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = 'en';

export const languageLabels: Record<SupportedLanguage, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

export function isSupportedLanguage(
  language: string | undefined
): language is SupportedLanguage {
  return supportedLanguages.includes(language as SupportedLanguage);
}

export function normalizeLanguage(language: string | undefined) {
  if (!language) {
    return defaultLanguage;
  }

  if (isSupportedLanguage(language)) {
    return language;
  }

  const normalized = language.toLowerCase();
  if (
    normalized.startsWith('zh-tw') ||
    normalized.startsWith('zh-hk') ||
    normalized.startsWith('zh-mo') ||
    normalized.includes('hant')
  ) {
    return 'zh-TW';
  }

  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }

  return defaultLanguage;
}
