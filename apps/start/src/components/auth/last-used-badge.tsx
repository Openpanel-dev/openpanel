import { TranslationText as DashboardText } from '@/i18n/provider';
export function LastUsedBadge() {
  return (
    <span className="absolute -top-2.5 right-3 rounded-full bg-highlight px-2 py-0.5 font-medium text-2xs text-white leading-none">
      <DashboardText i18nKey={'Used last time'} />{' '}
    </span>
  );
}
