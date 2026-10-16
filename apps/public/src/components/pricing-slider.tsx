'use client';
import NumberFlow from '@number-flow/react';
import { PRICING } from '@openpanel/payments/prices';
import { useState } from 'react';
import { Slider } from './ui/slider';
import { cn } from '@/lib/utils';

export function PricingSlider() {
  const [index, setIndex] = useState(2);
  const match = PRICING[index];
  const formatNumber = (value: number) => value.toLocaleString();

  return (
    <>
      <Slider
        max={PRICING.length}
        onValueChange={(value) => setIndex(value[0])}
        step={1}
        tooltip={
          match
            ? `${formatNumber(match.events)} events per month`
            : `More than ${formatNumber(PRICING[PRICING.length - 1].events)} events`
        }
        value={[index]}
      />

      {match ? (
        <div>
          <div>
            <NumberFlow
              className="text-5xl"
              format={{
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 1,
              }}
              locales={'en-US'}
              value={match.price}
            />
            <span className="ml-2 text-muted-foreground text-sm">/ month</span>
          </div>
          <span
            className={cn(
              'text-muted-foreground text-sm italic opacity-100',
              match.price === 0 && 'opacity-0'
            )}
          >
            + VAT if applicable
          </span>
          <div className="mt-1 text-emerald-600 text-sm dark:text-emerald-500">
            Pay yearly and get 2 months free
          </div>
        </div>
      ) : (
        <div className="text-lg">
          Contact us at{' '}
          <a className="underline" href="mailto:hello@openpanel.dev">
            hello@openpanel.dev
          </a>{' '}
          to get a custom quote.
        </div>
      )}
    </>
  );
}
