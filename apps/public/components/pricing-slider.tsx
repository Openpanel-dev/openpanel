'use client';
import NumberFlow from '@number-flow/react';

import { useState } from 'react';
import { Slider } from './ui/slider';

const PRICING = [
  { price: 0, events: 5_000 },
  { price: 5, events: 10_000 },
  { price: 20, events: 100_000 },
  { price: 30, events: 250_000 },
  { price: 50, events: 500_000 },
  { price: 90, events: 1_000_000 },
  { price: 180, events: 2_500_000 },
  { price: 250, events: 5_000_000 },
  { price: 400, events: 10_000_000 },
  // { price: 650, events: 20_000_000 },
  // { price: 900, events: 30_000_000 },
];

export function PricingSlider() {
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
            ? `${formatNumber(match.events)} events`
            : `More than ${formatNumber(PRICING[PRICING.length - 1].events)} events`
        }
        onValueChange={(value) => setIndex(value[0])}
      />

      {match ? (
        <div>
          <NumberFlow
            className="text-5xl"
            value={match.price}
            format={{
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            }}
            locales={'en-US'}
          />
          <span className="text-sm text-muted-foreground ml-2">/ month</span>
        </div>
      ) : (
        <div>Contact us hello@openpanel.dev</div>
      )}
    </>
  );
}
