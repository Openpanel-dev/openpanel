import { useId, useState, useSyncExternalStore } from 'react';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { type Language, languages } from '@/i18n/languages';
import { useTranslation } from '@/i18n/provider';

const subscribeToHydration = () => () => undefined;
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;
export function LanguageSettings() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    hydratedSnapshot,
    serverSnapshot
  );
  const { language, setLanguage, t } = useTranslation();
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const changeLanguage = async (value: Language) => {
    setPending(true);
    setError(false);
    try {
      await setLanguage(value);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead>
        <label className="title" htmlFor={id}>
          {t('Language')}
        </label>
      </WidgetHead>
      <WidgetBody className="col gap-3">
        <p>{t('Choose the language used throughout the dashboard.')}</p>
        <select
          aria-describedby={`${id}-description`}
          className="h-10 rounded-md border border-input bg-def-100 px-3"
          disabled={pending || !hydrated}
          id={id}
          onChange={(event) => {
            return changeLanguage(event.target.value as Language);
          }}
          value={language}
        >
          {languages.map((option) => (
            <option key={option.code} lang={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-sm" id={`${id}-description`}>
          {t('Language changes are saved for this browser.')}
        </p>
        <p aria-live="polite">{pending ? t('Loading language…') : ''}</p>
        {error && (
          <p role="alert">{t('Could not load this language. Try again.')}</p>
        )}
      </WidgetBody>
    </Widget>
  );
}
