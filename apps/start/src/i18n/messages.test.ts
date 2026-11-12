import { describe, expect, it } from 'vitest';
import { languageDirection, languages, resolveLanguage } from './languages';
import english from './locales/en.json';
import russian from './locales/ru.json';
import { createTranslator, loadMessages } from './messages';

describe('dashboard languages', () => {
  it('provides exactly30 unique languages including the requested scripts', () => {
    expect(languages).toHaveLength(30);
    expect(new Set(languages.map((language) => language.code)).size).toBe(30);
    for (const code of ['en', 'zh-CN', 'hi', 'es', 'ar', 'tr', 'ru']) {
      expect(languages.some((language) => language.code === code)).toBe(true);
    }
  });
  it('normalizes locale variants and rejects arbitrary cookie values', () => {
    expect(resolveLanguage('RU-ru')).toBe('ru');
    expect(resolveLanguage('zh_CN')).toBe('zh-CN');
    expect(resolveLanguage('pt-PT')).toBe('pt-BR');
    for (const value of [
      null,
      undefined,
      '../../en',
      '<script>',
      'cimode',
      {},
    ]) {
      expect(resolveLanguage(value)).toBe('en');
    }
  });
  it('keeps translator instances isolated across server requests and falls back to English', () => {
    const ru = createTranslator('ru', russian);
    const en = createTranslator('en', english);
    expect(ru.t('Language')).toBe('Язык');
    expect(en.t('Language')).toBe('Language');
    expect(ru.t('Language')).toBe('Язык');
    expect(createTranslator('ru', {}).t('Settings')).toBe('Settings');
  });
  it('uses RTL only for the corresponding languages', () => {
    for (const language of languages) {
      expect(languageDirection(language.code)).toBe(
        ['ar', 'fa', 'he', 'ur'].includes(language.code) ? 'rtl' : 'ltr'
      );
    }
  });
  it('loads all catalogs locally with the same complete message keys', async () => {
    const keys = Object.keys(english).sort();
    for (const language of languages) {
      const messages = await loadMessages(language.code);
      expect(Object.keys(messages).sort(), language.code).toEqual(keys);
      expect(
        Object.values(messages).every(
          (message) => typeof message === 'string' && message.trim().length > 0
        ),
        language.code
      ).toBe(true);
    }
  });
});
