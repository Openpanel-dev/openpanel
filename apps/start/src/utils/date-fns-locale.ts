import { enUS, zhCN, zhTW } from 'date-fns/locale';
import { normalizeLanguage } from '@/i18n/locales';

const DATE_FNS_LOCALES = {
  en: enUS,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
} as const;

export function getDateFnsLocale(language: string | undefined) {
  return DATE_FNS_LOCALES[normalizeLanguage(language)];
}
