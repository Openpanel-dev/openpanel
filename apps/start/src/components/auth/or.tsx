import { cn } from '@/utils/cn';
import { useTranslation } from 'react-i18next';

export function Or({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn('row items-center gap-4', className)}>
      <div className="h-px w-full bg-def-300" />
      <span className="text-muted-foreground text-sm font-medium px-2">
        {t('common.or')}
      </span>
      <div className="h-px w-full bg-def-300" />
    </div>
  );
}
