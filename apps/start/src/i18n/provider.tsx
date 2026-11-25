import { DirectionProvider } from '@radix-ui/react-direction';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { saveLanguage } from './language-preference';
import {
  DEFAULT_LANGUAGE,
  type Language,
  languageDirection,
  resolveLanguage,
} from './languages';
import english from './locales/en.json';
import { createTranslator, loadMessages, type Messages } from './messages';

const englishTranslator = createTranslator(DEFAULT_LANGUAGE, english);
interface LanguageContextValue {
  language: Language;
  direction: 'ltr' | 'rtl';
  setLanguage: (language: Language) => Promise<void>;
  t: typeof englishTranslator.t;
}
const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  direction: 'ltr',
  setLanguage: () =>
    Promise.reject(new Error('LanguageProvider is not mounted')),
  t: englishTranslator.t,
});
export function LanguageProvider({
  initialLanguage,
  initialMessages,
  children,
}: {
  initialLanguage: Language;
  initialMessages: Messages;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState(() => ({
    language: initialLanguage,
    translator: createTranslator(initialLanguage, initialMessages),
  }));
  const requested = useRef(0);
  const setLanguage = useCallback(async (requestedLanguage: Language) => {
    const language = resolveLanguage(requestedLanguage);
    const request = ++requested.current;
    const messages = await loadMessages(language);
    if (request !== requested.current) {
      return;
    }
    const translator = createTranslator(language, messages);
    await saveLanguage({ data: language });
    if (request !== requested.current) {
      return;
    }
    setSelection({ language, translator });
  }, []);
  const value = useMemo(
    () => ({
      language: selection.language,
      direction: languageDirection(selection.language),
      setLanguage,
      t: selection.translator.t,
    }),
    [selection, setLanguage]
  );
  return (
    <LanguageContext value={value}>
      <DirectionProvider dir={value.direction}>{children}</DirectionProvider>
    </LanguageContext>
  );
}
export function useTranslation() {
  return use(LanguageContext);
}
export function TranslationText({ i18nKey }: { i18nKey: string }) {
  const { t } = useTranslation();
  return t(i18nKey);
}
