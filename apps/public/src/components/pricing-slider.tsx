'use client';
import NumberFlow from '@number-flow/react';

import { cn } from '@/lib/utils';
import { PRICING } from '@openpanel/payments/prices';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Slider } from './ui/slider';

export function PricingSlider() {
  const t = useTranslations();
  const [index, setIndex] = useState(2);
  const match = PRICING[index];
  const formatNumber = (value: number) => value.toLocaleString();

  return (
    <>
      <Slider
        value={[index]}
        max={PRICING.length}
        step={1}
        tooltip={
          match
            ? `${formatNumber(match.events)} ${t('pages.pricing_events_per_month')}`
            : `${t('pages.pricing_slider_more_than')} ${formatNumber(PRICING[PRICING.length - 1].events)} ${t('pages.pricing_events_per_month')}`
        }
        onValueChange={(value) => setIndex(value[0])}
      />

      {match ? (
        <div>
          <div>
            <NumberFlow
              className="text-5xl"
              value={match.price}
              format={{
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 1,
              }}
              locales={'en-US'}
            />
            <span className="text-sm text-muted-foreground ml-2">
              / {t('home.pricing_per_month').toLowerCase()}
            </span>
          </div>
          <span
            className={cn(
              'text-sm text-muted-foreground italic opacity-100',
              match.price === 0 && 'opacity-0',
            )}
          >
            {t('home.pricing_vat')}
          </span>
        </div>
      ) : (
        <div className="text-lg">
          {t('home.pricing_custom_quote_prefix')}{' '}
          <a className="underline" href="mailto:hello@openpanel.dev">
            hello@openpanel.dev
          </a>{' '}
          {t('home.pricing_custom_quote_suffix')}
        </div>
      )}
    </>
  );
}
