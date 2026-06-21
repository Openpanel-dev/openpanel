'use client';

import { LanguagesIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { persistLocale } from '@/i18n/client';
import {
  type AppLocale,
  getLocaleSwitchHref,
  isLocale,
  languageItems,
  localizedHref,
} from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({
  locale,
  label,
  className,
  compact = false,
}: {
  locale: AppLocale;
  label: string;
  className?: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [pathnameLocale] = pathname?.split('/').filter(Boolean) ?? [];
  const activeLocale = isLocale(pathnameLocale) ? pathnameLocale : locale;
  const current = languageItems.find((item) => item.locale === activeLocale);

  return (
    <div className={cn('group/language relative', className)}>
      <Button
        aria-label={label}
        className="gap-1.5 px-2"
        size={compact ? 'icon' : 'default'}
        type="button"
        variant="ghost"
      >
        <LanguagesIcon className="size-4" />
        {!compact && (
          <span className="font-semibold text-xs">
            {current?.shortLabel ?? locale}
          </span>
        )}
      </Button>
      <div className="invisible absolute top-full right-0 z-50 min-w-36 pt-2 opacity-0 transition group-focus-within/language:visible group-focus-within/language:opacity-100 group-hover/language:visible group-hover/language:opacity-100">
        <div className="flex flex-col gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
          {languageItems.map((item) => (
            <Link
              aria-current={item.locale === activeLocale ? 'true' : undefined}
              className={cn(
                'block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                item.locale === activeLocale && 'bg-accent font-medium'
              )}
              href={
                mounted
                  ? getLocaleSwitchHref(pathname, item.locale)
                  : localizedHref('/', item.locale)
              }
              hrefLang={item.locale}
              key={item.locale}
              onClick={() => persistLocale(item.locale)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
