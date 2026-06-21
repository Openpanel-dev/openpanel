'use client';

import NumberFlow from '@number-flow/react';
import { PRICING } from '@openpanel/payments/prices';
import { CheckIcon, ServerIcon, StarIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { localizedHref, toAppLocale } from '@/i18n/routing';
import { cn, formatEventsCount } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';

export function Pricing() {
  const locale = toAppLocale(useLocale());
  const t = useTranslations('home');
  const [selectedIndex, setSelectedIndex] = useState(2);
  const selected = PRICING[selectedIndex];

  return (
    <Section className="container">
      <div className="col md:row gap-16">
        <div className="col w-full min-w-sm gap-4 rounded-3xl border bg-linear-to-b from-card to-background p-6 md:w-1/3">
          <p className="text-muted-foreground text-sm">
            {t('pricing_event_prompt')}
          </p>
          <div className="row flex-wrap gap-2">
            {PRICING.map((tier, index) => (
              <Button
                className={cn('relative h-8 rounded-full border px-4')}
                key={tier.price}
                onClick={() => setSelectedIndex(index)}
                size="sm"
                variant={selectedIndex === index ? 'default' : 'outline'}
              >
                {tier.popular && <StarIcon className="size-4" />}
                {formatEventsCount(tier.events)}
              </Button>
            ))}
            <Button
              className={cn('relative h-8 rounded-full border px-4')}
              onClick={() => setSelectedIndex(-1)}
              size="sm"
              variant={selectedIndex === -1 ? 'default' : 'outline'}
            >
              {t('pricing_custom')}
            </Button>
          </div>
          <div className="col mt-8 w-full items-baseline md:mt-auto">
            {selected ? (
              <>
                <span className="mb-2 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary text-xs">
                  {t('pricing_free_trial')}
                </span>
                <div className="row items-end gap-3">
                  <NumberFlow
                    className="font-bold text-5xl"
                    format={{
                      style: 'currency',
                      currency: 'USD',
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 1,
                    }}
                    locales={'en-US'}
                    value={selected.price}
                  />
                </div>
                <div className="row w-full justify-between">
                  <span className="-mt-2 text-muted-foreground/80 text-sm">
                    {t('pricing_per_month')}
                  </span>
                  <span className="-mt-2 text-muted-foreground/80 text-sm">
                    {t('pricing_vat')}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-lg">
                {t('pricing_custom_quote_prefix')}{' '}
                <a className="underline" href="mailto:hello@openpanel.dev">
                  hello@openpanel.dev
                </a>{' '}
                {t('pricing_custom_quote_suffix')}
              </div>
            )}
          </div>
        </div>

        <div className="col flex-1 shrink-0 justify-center gap-8">
          <div className="col gap-4">
            <SectionHeader
              description={t('pricing_description')}
              title={t('pricing_title')}
            />
          </div>

          <ul className="col gap-2">
            {Array.from({ length: 6 }, (_, index) => {
              const n = index + 1;
              const feature = t(`pricing_feature_${n}`);

              return (
                <li className="row items-start gap-2 text-sm" key={feature}>
                  <CheckIcon className="mt-0.5 size-4 shrink-0" />
                  <span>{feature}</span>
                </li>
              );
            })}
          </ul>

          <GetStartedButton className="w-fit" locale={locale} />

          <p className="row items-center gap-2 text-muted-foreground text-sm">
            <ServerIcon className="size-4 shrink-0" />
            {t('pricing_self_host_prefix')}{' '}
            <Link
              className="text-primary hover:underline"
              href={localizedHref('/docs/self-hosting/self-hosting', locale)}
            >
              {t('pricing_self_host_link')}
            </Link>{' '}
            {t('pricing_self_host_suffix')}
          </p>
        </div>
      </div>
    </Section>
  );
}
