'use client';

import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import NumberFlow from '@number-flow/react';
import { PRICING } from '@openpanel/payments/prices';

import { CheckIcon, StarIcon } from 'lucide-react';
import { useState } from 'react';

import { formatEventsCount } from '@/lib/utils';

const features = [
  'Unlimited websites or apps',
  'Unlimited users',
  'Unlimited dashboards',
  'Unlimited charts',
  'Unlimited tracked profiles',
  'Yes, we have no limits or hidden costs',
];

export function Pricing() {
  const [selectedIndex, setSelectedIndex] = useState(2);
  const selected = PRICING[selectedIndex];

  return (
    <Section className="container">
      <div className="col md:row gap-16">
        <div className="w-full md:w-1/3 min-w-sm col gap-4 border rounded-3xl p-6 bg-linear-to-b from-card to-background">
          <p className="text-sm text-muted-foreground">
            Choose how many events you'll track this month
          </p>
          <div className="row flex-wrap gap-2">
            {PRICING.map((tier, index) => (
              <Button
                key={tier.price}
                variant={selectedIndex === index ? 'default' : 'outline'}
                size="sm"
                className={cn('h-8 rounded-full relative px-4 border')}
                onClick={() => setSelectedIndex(index)}
              >
                {tier.popular && <StarIcon className="size-4" />}
                {formatEventsCount(tier.events)}
              </Button>
            ))}
            <Button
              variant={selectedIndex === -1 ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 rounded-full relative px-4 border')}
              onClick={() => setSelectedIndex(-1)}
            >
              Custom
            </Button>
          </div>
          <div className="col items-baseline mt-8 md:mt-auto w-full">
            {selected ? (
              <>
                <NumberFlow
                  className="text-5xl font-bold"
                  value={selected.price}
                  format={{
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 1,
                  }}
                  locales={'en-US'}
                />
                <div className="row justify-between w-full">
                  <span className="text-muted-foreground/80 text-sm -mt-2">
                    Per month
                  </span>
                  <span className="text-muted-foreground/80 text-sm -mt-2">
                    + VAT if applicable
                  </span>
                </div>
              </>
            ) : (
              <div className="text-lg">
                Contact us at{' '}
                <a className="underline" href="mailto:hello@openpanel.dev">
                  hello@openpanel.dev
                </a>{' '}
                to get a custom quote.
              </div>
            )}
          </div>
        </div>

        <div className="col gap-8 justify-center flex-1 shrink-0">
          <div className="col gap-4">
            <SectionHeader
              title="Simple, transparent pricing"
              description="Pay only for what you use. Choose your event volume - everything else is unlimited. No surprises, no hidden fees."
            />
          </div>

          <ul className="col gap-2">
            {features.map((feature) => (
              <li key={feature} className="row gap-2 items-start text-sm">
                <CheckIcon className="size-4 shrink-0 mt-0.5" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <GetStartedButton className="w-fit" />

          <p className="text-sm text-muted-foreground">
            All features are included upfront - no hidden costs. You choose how
            many events to track each month.
          </p>
        </div>
      </div>
    </Section>
  );
}
