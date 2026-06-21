import { getLocale } from 'next-intl/server';
import { toAppLocale, type AppLocale } from '@/i18n/routing';

export async function getAppLocale(): Promise<AppLocale> {
  return toAppLocale(await getLocale());
}
