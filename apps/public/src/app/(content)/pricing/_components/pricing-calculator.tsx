'use client';

import NumberFlow from '@number-flow/react';
import { PRICING } from '@openpanel/payments/prices';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { GetStartedButton } from '@/components/get-started-button';
import { Button } from '@/components/ui/button';
import { cn, formatEventsCount } from '@/lib/utils';

const DEFAULT_TIER_INDEX = PRICING.findIndex((tier) => tier.popular);
const CUSTOM_TIER_INDEX = PRICING.length;
const MONTHS_PAID_PER_YEAR = 10;
const MONTHS_PER_YEAR = 12;
const CUSTOM_QUOTE_HREF =
  'mailto:hello@openpanel.dev?subject=Custom%20plan%20for%20OpenPanel%20Cloud';

const INCLUDED = [
  'Unlimited websites and apps',
  'Unlimited team members',
  'Unlimited dashboards and reports',
  'Unlimited tracked profiles',
  'Every feature, no add-ons',
  'Hosted in the EU',
];

const TICK_LABELS: { label: string; events: number }[] = [
  { label: '5K', events: 5000 },
  { label: '100K', events: 100_000 },
  { label: '1M', events: 1_000_000 },
  { label: '10M', events: 10_000_000 },
];
const TICKS = [
  ...TICK_LABELS.map((tick) => ({
    label: tick.label,
    index: PRICING.findIndex((tier) => tier.events === tick.events),
  })),
  { label: '50M+', index: CUSTOM_TIER_INDEX },
];

type Billing = 'monthly' | 'yearly';

function BillingToggle({
  value,
  onChange,
}: {
  value: Billing;
  onChange: (value: Billing) => void;
}) {
  const options: { value: Billing; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
  ];
  return (
    <div
      aria-label="Billing period"
      className="row w-fit gap-1 rounded-full bg-neutral-100 p-1 text-sm"
      role="radiogroup"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={cn(
              'row items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium transition-all max-sm:px-2.5',
              selected
                ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-black/5'
                : 'text-neutral-500 hover:text-neutral-900'
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            {option.label}
            {option.value === 'yearly' && (
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                2 months free
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function EventSlider({
  index,
  onChange,
}: {
  index: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="col gap-3">
      <SliderPrimitive.Root
        aria-label="Events per month"
        className="relative flex h-6 w-full touch-none select-none items-center"
        max={CUSTOM_TIER_INDEX}
        min={0}
        onValueChange={([value]) => onChange(value ?? 0)}
        step={1}
        value={[index]}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-neutral-200">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-neutral-900" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-6 cursor-grab rounded-full bg-white shadow-md ring-1 ring-black/10 transition-shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/15 active:cursor-grabbing" />
      </SliderPrimitive.Root>
      <div className="relative h-4 font-mono text-[11px] text-neutral-400">
        {TICKS.map((tick) => (
          <button
            className={cn(
              'absolute -translate-x-1/2 transition-colors first:translate-x-0 last:-translate-x-full hover:text-neutral-900',
              tick.index === index && 'text-neutral-900'
            )}
            key={tick.label}
            onClick={() => onChange(tick.index)}
            style={{ left: `${(tick.index / CUSTOM_TIER_INDEX) * 100}%` }}
            type="button"
          >
            {tick.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PriceReadout({ price, billing }: { price: number; billing: Billing }) {
  const isYearly = billing === 'yearly';
  const yearlyTotal = price * MONTHS_PAID_PER_YEAR;
  const perMonth = isYearly ? yearlyTotal / MONTHS_PER_YEAR : price;
  return (
    <div className="col gap-1">
      <div className="row items-baseline gap-2">
        <NumberFlow
          className="font-semibold text-6xl tracking-[-0.04em]"
          format={{
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }}
          locales="en-US"
          value={perMonth}
        />
        <span className="text-neutral-500">/ month</span>
      </div>
      <span className="text-neutral-500 text-sm">
        {isYearly
          ? `$${yearlyTotal.toLocaleString('en-US')} billed yearly, + VAT if applicable`
          : 'Billed monthly, + VAT if applicable'}
      </span>
    </div>
  );
}

export function PricingCalculator() {
  const [index, setIndex] = useState(DEFAULT_TIER_INDEX);
  const [billing, setBilling] = useState<Billing>('monthly');
  const tier = PRICING[index];
  const isCustom = !tier;

  return (
    <div className="surface mx-auto grid max-w-5xl grid-cols-1 overflow-hidden rounded-3xl text-left md:grid-cols-[7fr_5fr]">
      <div className="col gap-8 p-6 md:p-10">
        <div className="col gap-2">
          <span className="text-neutral-500 text-sm">
            How many events do you track a month?
          </span>
          <div className="row flex-wrap items-center gap-3">
            <span className="font-semibold text-3xl tracking-[-0.02em]">
              {isCustom
                ? 'More than 50M events'
                : `${formatEventsCount(tier.events)} events`}
            </span>
            {tier?.popular && (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 font-medium text-[11px] text-white">
                Most popular
              </span>
            )}
          </div>
        </div>
        <EventSlider index={index} onChange={setIndex} />
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 border-neutral-100 border-t pt-6 text-sm sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <li className="row items-center gap-2 text-neutral-700" key={item}>
              <CheckIcon className="size-4 shrink-0 text-emerald-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="col justify-between gap-8 bg-neutral-50 p-6 md:p-10">
        <BillingToggle onChange={setBilling} value={billing} />
        {isCustom ? (
          <div className="col gap-2">
            <span className="font-semibold text-4xl tracking-[-0.03em]">
              Custom
            </span>
            <span className="text-neutral-500 text-sm">
              Volume pricing for teams above 50M events a month.
            </span>
          </div>
        ) : (
          <PriceReadout billing={billing} price={tier.price} />
        )}
        <div className="col gap-3">
          {isCustom ? (
            <Button asChild className="w-full" size="lg">
              <a href={CUSTOM_QUOTE_HREF}>Get a custom quote</a>
            </Button>
          ) : (
            <GetStartedButton className="w-full" />
          )}
          <span className="text-center text-neutral-500 text-xs">
            {isCustom
              ? 'Tell us your volume and we will send a quote.'
              : '30-day free trial. No credit card needed.'}
          </span>
        </div>
      </div>
    </div>
  );
}
