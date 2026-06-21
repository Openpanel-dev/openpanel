'use client';

import { LanguagesIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import type { ThemeSwitchProps } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import {
  getLocaleSwitchHref,
  isLocale,
  languageItems,
} from '@/i18n/routing';
import { persistLocale } from '@/i18n/client';
import { cn } from '@/lib/utils';

export function FumadocsThemeControls({
  className,
  ...props
}: ThemeSwitchProps) {
  const pathname = usePathname();
  const activeLocale = getActiveLocale(pathname);
  const current = languageItems.find((item) => item.locale === activeLocale);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          aria-expanded={open}
          aria-label="Change language"
          className="flex size-8 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <LanguagesIcon className="size-4" />
          <span className="sr-only">
            {current ? `Current language: ${current.label}` : 'Change language'}
          </span>
        </button>
        <div
          className={cn(
            'absolute top-full right-0 z-50 mt-2 min-w-36 transition md:top-auto md:right-auto md:bottom-full md:left-0 md:mt-0 md:mb-2',
            open
              ? 'visible translate-y-0 opacity-100'
              : 'invisible translate-y-1 opacity-0'
          )}
        >
          <div className="flex flex-col gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            {languageItems.map((item) => (
              <Link
                aria-current={item.locale === activeLocale ? 'true' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                  item.locale === activeLocale && 'bg-accent font-medium'
                )}
                href={getLocaleSwitchHref(pathname, item.locale)}
                hrefLang={item.locale}
                key={item.locale}
                onClick={() => {
                  persistLocale(item.locale);
                  setOpen(false);
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <ThemeSwitch className={className} {...props} />
    </>
  );
}

function getActiveLocale(pathname: string | null) {
  const [pathnameLocale] = pathname?.split('/').filter(Boolean) ?? [];
  return isLocale(pathnameLocale) ? pathnameLocale : 'en';
}
