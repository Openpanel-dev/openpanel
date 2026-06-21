import { getRequestConfig } from 'next-intl/server';
import { toAppLocale } from '@/i18n/routing';
import { getRequestContentLocale } from '@/lib/content-locale';

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = toAppLocale(
    (await requestLocale) ?? (await getRequestContentLocale())
  );

  return {
    locale,
    messages: (await import(`../../locales/${locale}.json`)).default,
  };
});
