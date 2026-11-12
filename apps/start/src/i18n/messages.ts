import { createInstance } from 'i18next';
import { DEFAULT_LANGUAGE, type Language } from './languages';
import english from './locales/en.json';
export type Messages = Record<string, string>;
const loaders = import.meta.glob<{ default: Messages }>([
  './locales/*.json',
  '!./locales/en.json',
]);
export async function loadMessages(language: Language): Promise<Messages> {
  if (language === DEFAULT_LANGUAGE) {
    return english;
  }
  const loader = loaders[`./locales/${language}.json`];
  if (!loader) {
    throw new Error(`Missing UI language catalog: ${language}`);
  }
  return (await loader()).default;
}
export function createTranslator(language: Language, messages: Messages) {
  const instance = createInstance();
  instance.init({
    lng: language,
    supportedLngs: false,
    fallbackLng: DEFAULT_LANGUAGE,
    load: 'currentOnly',
    keySeparator: false,
    nsSeparator: false,
    initAsync: false,
    resources: {
      en: { translation: english },
      [language]: { translation: messages },
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
  return instance;
}
