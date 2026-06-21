'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TOOLS } from './tools';
import { localizedHref, toAppLocale, type AppLocale } from '@/i18n/routing';

export default function ToolsSidebar({
  locale,
}: {
  locale: AppLocale;
}): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('pages');
  const resolvedLocale = toAppLocale(locale);

  return (
    <aside>
      <div className="lg:sticky lg:top-24">
        <nav className="space-y-2">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const href = localizedHref(tool.url, resolvedLocale);
            const isActive = pathname === href || pathname === tool.url;
            const name =
              tool.url === '/tools/url-checker'
                ? t('tools_url_checker_name')
                : tool.url === '/tools/ip-lookup'
                  ? t('tools_ip_lookup_name')
                  : tool.name;
            const description =
              tool.url === '/tools/url-checker'
                ? t('tools_url_checker_description')
                : tool.url === '/tools/ip-lookup'
                  ? t('tools_ip_lookup_description')
                  : tool.description;
            return (
              <Link
                key={tool.url}
                href={href}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground',
                )}
                >
                  <Icon className="size-5 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                      {name}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {description}
                    </p>
                  </div>
                </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
