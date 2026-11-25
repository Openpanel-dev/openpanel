import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { cn } from '@/utils/cn';

interface LogoProps {
  className?: string;
}

export function LogoSquare({ className }: LogoProps) {
  const { t: translateUi } = useDashboardTranslation();

  return (
    <img
      alt={translateUi('Openpanel logo')}
      className={cn('rounded-md', className)}
      src="/logo.svg"
    />
  );
}

export function Logo({ className }: LogoProps) {
  return (
    <div
      className={cn('flex items-center gap-2 font-medium text-xl', className)}
    >
      <LogoSquare className="max-h-8" />
      <span>
        <DashboardText i18nKey={'openpanel.dev'} />
      </span>
    </div>
  );
}
