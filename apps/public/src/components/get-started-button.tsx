'use client';

import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';

export function GetStartedButton({
  text,
  href = 'https://dashboard.openpanel.dev/onboarding',
  className,
  locale,
}: {
  text?: React.ReactNode;
  className?: string;
  href?: string;
  locale?: AppLocale;
}) {
  const t = useTranslations('common');

  return (
    <Button asChild className={cn('group', className)} size="lg">
      <Link href={href}>
        {text ?? t('start_free_trial')}
        <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-1 group-hover:scale-125" />
      </Link>
    </Button>
  );
}
