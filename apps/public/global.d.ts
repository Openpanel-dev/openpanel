import type { locales } from './src/i18n/routing';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof locales)[number];
  }
}
