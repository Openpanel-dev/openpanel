import { cn } from '@/lib/utils';
import { localizedHref, type AppLocale } from '@/i18n/routing';
import {
  CheckIcon,
  HeartHandshakeIcon,
  MessageSquareIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  ZapIcon,
  PackageIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const perks = [
  {
    icon: PackageIcon,
    key: 'latestDocker',
    href: '/docs/self-hosting/supporter-access-latest-docker-images',
    highlight: true,
  },
  {
    icon: MessageSquareIcon,
    key: 'prioritySupport',
    href: undefined,
    highlight: true,
  },
  {
    icon: RocketIcon,
    key: 'featureRequests',
    href: undefined,
    highlight: true,
  },
  {
    icon: StarIcon,
    key: 'discordRole',
    href: undefined,
    highlight: false,
  },
  {
    icon: SparklesIcon,
    key: 'earlyAccess',
    href: undefined,
    highlight: false,
  },
  {
    icon: ZapIcon,
    key: 'directImpact',
    href: undefined,
    highlight: false,
  },
] as const;

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function SupporterPerks({
  className,
  locale,
}: {
  className?: string;
  locale: AppLocale;
}) {
  const t = useTranslations('pages');

  return (
    <div
      className={cn(
        'col gap-4 p-6 rounded-xl border bg-card',
        'sticky top-24',
        className,
      )}
    >
      <div className="col gap-2 mb-2">
        <div className="row gap-2 items-center">
          <HeartHandshakeIcon className="size-5 text-primary" />
          <h3 className="font-semibold text-lg">
            {t('supporter_perks_title')}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('supporter_perks_description')}
        </p>
      </div>

      <div className="col gap-3">
        {perks.map((perk, index) => {
          const Icon = perk.icon;
          const title = t(`supporter_cards_${toSnakeCase(perk.key)}_title`);
          const description = t(
            `supporter_cards_${toSnakeCase(perk.key)}_description`,
          );
          return (
            <div
              key={index}
              className={cn(
                'col gap-1.5 p-3 rounded-lg border transition-colors',
                perk.highlight
                  ? 'bg-primary/5 border-primary/20'
                  : 'bg-background border-border',
              )}
            >
              <div className="row gap-2 items-start">
                <Icon
                  className={cn(
                    'size-4 mt-0.5 shrink-0',
                    perk.highlight ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                <div className="col gap-0.5 flex-1 min-w-0">
                  <div className="row gap-2 items-center">
                    <h4
                      className={cn(
                        'font-medium text-sm',
                        perk.highlight && 'text-primary',
                      )}
                    >
                      {title}
                    </h4>
                    {perk.highlight && (
                      <CheckIcon className="size-3.5 text-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {description}
                  </p>
                  {perk.href && (
                    <Link
                      href={localizedHref(perk.href, locale)}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      {t('supporter_learn_more')}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-muted-foreground text-center">
          {t('supporter_starting_at')}{' '}
          <strong className="text-foreground">$20/month</strong>
        </p>
      </div>
    </div>
  );
}
