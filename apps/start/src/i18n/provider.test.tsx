// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveLanguage } from './language-preference';
import english from './locales/en.json';
import russian from './locales/ru.json';
import { LanguageProvider, TranslationText, useTranslation } from './provider';
import { LanguageSettings } from '@/components/settings/language-settings';

vi.mock('./language-preference', () => ({
  saveLanguage: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function Content() {
  const { language, direction, setLanguage } = useTranslation();
  return (
    <main dir={direction} lang={language}>
      <TranslationText i18nKey="Settings" />
      <button onClick={() => setLanguage('ru')} type="button">
        switch
      </button>
      <span data-testid="untrusted">Settings &lt;script&gt;</span>
    </main>
  );
}
describe('language provider', () => {
  it('renders English outside a provider', () => {
    render(<TranslationText i18nKey="Settings" />);
    expect(screen.getByText('Settings')).toBeTruthy();
  });
  it('changes visible strings, saves the preference, and preserves user data', async () => {
    render(
      <LanguageProvider initialLanguage="en" initialMessages={english}>
        <Content />
      </LanguageProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    });
    expect(screen.getByText('Настройки')).toBeTruthy();
    expect(saveLanguage).toHaveBeenCalledWith({ data: 'ru' });
    expect(screen.getByTestId('untrusted').textContent).toBe(
      'Settings <script>'
    );
  });
  it('renders the selected language on the server without global state', () => {
    const html = renderToString(
      <LanguageProvider initialLanguage="ru" initialMessages={russian}>
        <Content />
      </LanguageProvider>
    );
    expect(html).toContain('lang="ru"');
    expect(html).toContain('Настройки');
    expect(
      renderToString(
        <LanguageProvider initialLanguage="en" initialMessages={english}>
          <Content />
        </LanguageProvider>
      )
    ).toContain('Settings');
  });
});

describe('language settings hydration', () => {
  it('disables the server-rendered selector until event handlers are ready', () => {
    const html = renderToString(<LanguageSettings />);
    expect(html).toMatch(/<select[^>]*disabled=""/);
    render(<LanguageSettings />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(
      false
    );
  });
});
