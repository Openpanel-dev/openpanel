export const LANGUAGE_COOKIE = 'ui-language';
export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const languages = [
  { code: 'en', name: 'English', direction: 'ltr' },
  { code: 'zh-CN', name: '简体中文', direction: 'ltr' },
  { code: 'hi', name: 'हिन्दी', direction: 'ltr' },
  { code: 'es', name: 'Español', direction: 'ltr' },
  { code: 'ar', name: 'العربية', direction: 'rtl' },
  { code: 'tr', name: 'Türkçe', direction: 'ltr' },
  { code: 'ru', name: 'Русский', direction: 'ltr' },
  { code: 'fr', name: 'Français', direction: 'ltr' },
  { code: 'de', name: 'Deutsch', direction: 'ltr' },
  { code: 'pt-BR', name: 'Português (Brasil)', direction: 'ltr' },
  { code: 'it', name: 'Italiano', direction: 'ltr' },
  { code: 'ja', name: '日本語', direction: 'ltr' },
  { code: 'ko', name: '한국어', direction: 'ltr' },
  { code: 'nl', name: 'Nederlands', direction: 'ltr' },
  { code: 'pl', name: 'Polski', direction: 'ltr' },
  { code: 'uk', name: 'Українська', direction: 'ltr' },
  { code: 'id', name: 'Bahasa Indonesia', direction: 'ltr' },
  { code: 'vi', name: 'Tiếng Việt', direction: 'ltr' },
  { code: 'th', name: 'ไทย', direction: 'ltr' },
  { code: 'fa', name: 'فارسی', direction: 'rtl' },
  { code: 'he', name: 'עברית', direction: 'rtl' },
  { code: 'bn', name: 'বাংলা', direction: 'ltr' },
  { code: 'ur', name: 'اردو', direction: 'rtl' },
  { code: 'ta', name: 'தமிழ்', direction: 'ltr' },
  { code: 'mr', name: 'मराठी', direction: 'ltr' },
  { code: 'gu', name: 'ગુજરાતી', direction: 'ltr' },
  { code: 'sw', name: 'Kiswahili', direction: 'ltr' },
  { code: 'el', name: 'Ελληνικά', direction: 'ltr' },
  { code: 'sv', name: 'Svenska', direction: 'ltr' },
  { code: 'cs', name: 'Čeština', direction: 'ltr' },
] as const;
export type Language = (typeof languages)[number]['code'];
export function resolveLanguage(value: unknown): Language {
  if (typeof value !== 'string') {
    return DEFAULT_LANGUAGE;
  }
  const normalized = value.replace('_', '-').toLowerCase();
  const exact = languages.find(
    (language) => language.code.toLowerCase() === normalized
  );
  if (exact) {
    return exact.code;
  }
  const base = normalized.split('-')[0];
  return (
    languages.find(
      (language) => language.code.toLowerCase().split('-')[0] === base
    )?.code ?? DEFAULT_LANGUAGE
  );
}
export function languageDirection(language: Language) {
  return languages.find((item) => item.code === language)?.direction ?? 'ltr';
}
