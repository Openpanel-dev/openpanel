import { cn } from '@/lib/utils';
import { PRICING } from '@openpanel/payments/src/prices';
import { CheckIcon, ChevronRightIcon, DollarSignIcon } from 'lucide-react';
import Link from 'next/link';
import { DoubleSwirl } from '../Swirls';
import { Section, SectionHeader } from '../section';
import { Tag } from '../tag';
import { Button } from '../ui/button';
import { Tooltiper } from '../ui/tooltip';

export default Pricing;
export function Pricing({ className }: { className?: string }) {
  return (
    <Section
      className={cn(
        'overflow-hidden relative bg-foreground dark:bg-background-dark text-background dark:text-foreground xl:rounded-xl p-0 pb-32 pt-16 max-w-7xl mx-auto',
        className,
      )}
    >
      <DoubleSwirl className="absolute top-0 left-0" />
      <div className="container relative z-10 col">
        <SectionHeader
          tag={
            <Tag variant={'dark'}>
              <DollarSignIcon className="size-4" />
              Simple and predictable
            </Tag>
          }
          title="Simple pricing"
          description="Just pick how many events you want to track each month. No hidden costs."
        />

        <div className="grid self-center md:grid-cols-[200px_1fr] lg:grid-cols-[300px_1fr] gap-8">
          <div className="col gap-4">
            <h3 className="font-medium text-xl text-background/90 dark:text-foreground/90">
              Stop overpaying for features
            </h3>
            <ul className="gap-1 col text-background/70 dark:text-foreground/70">
              <li className="flex items-center gap-2">
                <CheckIcon className="text-background/30 dark:text-foreground/30 size-4" />
                Unlimited websites or apps
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon className="text-background/30 dark:text-foreground/30 size-4" />{' '}
                Unlimited users
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon className="text-background/30 dark:text-foreground/30 size-4" />{' '}
                Unlimited dashboards
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon className="text-background/30 dark:text-foreground/30 size-4" />{' '}
                Unlimited charts
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon className="text-background/30 dark:text-foreground/30 size-4" />{' '}
                Unlimited tracked profiles
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon className="text-background/30 dark:text-foreground/30 size-4" />{' '}
                Yes, we have no limits or hidden costs
              </li>
            </ul>

            <Button
              variant="secondary"
              size="lg"
              asChild
              className="self-start mt-4 px-8 group"
            >
              <Link href="https://dashboard.openpanel.dev/onboarding">
                Get started now
                <ChevronRightIcon className="size-4 group-hover:translate-x-1 transition-transform group-hover:scale-125" />
              </Link>
            </Button>
          </div>

          <div className="col justify-between gap-4 max-w-lg">
            <div className="space-y-2">
              {PRICING.map((tier) => (
                <div
                  key={tier.events}
                  className={cn(
                    'group col',
                    'backdrop-blur-3xl bg-foreground/70 dark:bg-background-dark/70',
                    'p-4 py-2 border border-background/20 dark:border-foreground/20 rounded-lg hover:bg-background/5 dark:hover:bg-foreground/5 transition-colors',
                    'mx-2',
                    tier.discount &&
                      'mx-0 px-6 py-3 !bg-emerald-900/20 hover:!bg-emerald-900/30',
                    tier.popular &&
                      'mx-0 px-6 py-3 !bg-orange-900/20 hover:!bg-orange-900/30',
                  )}
                >
                  <div className="row justify-between">
                    <div>
                      {new Intl.NumberFormat('en-US', {}).format(tier.events)}{' '}
                      <span className="text-muted-foreground text-sm max-[420px]:hidden">
                        events / month
                      </span>
                    </div>
                    <div className="row gap-4">
                      {tier.popular && (
                        <>
                          <Tag variant="dark" className="hidden md:inline-flex">
                            🔥 Popular
                          </Tag>
                          <span className="md:hidden">🔥</span>
                        </>
                      )}
                      {tier.discount && (
                        <>
                          <Tag
                            variant="dark"
                            className="hidden md:inline-flex whitespace-nowrap"
                          >
                            💸 Discount
                          </Tag>
                          <span className="md:hidden">💸</span>
                        </>
                      )}

                      <div className="row gap-1">
                        {tier.discount && (
                          <span className={cn('text-md font-semibold')}>
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            }).format(tier.price * (1 - tier.discount.amount))}
                          </span>
                        )}
                        <span
                          className={cn(
                            'text-md font-semibold',
                            tier.discount && 'line-through opacity-50',
                          )}
                        >
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          }).format(tier.price)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {tier.discount && (
                    <div className="text-sm text-muted-foreground mt-2">
                      Limited discount code available:{' '}
                      <Tooltiper
                        content={`Get ${tier.discount.amount * 100}% off your first year`}
                        delayDuration={0}
                        side="bottom"
                      >
                        <strong>{tier.discount.code}</strong>
                      </Tooltiper>
                    </div>
                  )}
                </div>
              ))}
              <div
                className={cn(
                  'group',
                  'row justify-between p-4 py-2 border border-background/20 dark:border-foreground/20 rounded-lg hover:bg-background/5 dark:hover:bg-foreground/5 transition-colors',
                  'mx-2',
                )}
              >
                <div className="whitespace-nowrap">
                  Over{' '}
                  {new Intl.NumberFormat('en-US', {}).format(
                    PRICING[PRICING.length - 1].events,
                  )}
                </div>
                <div className="text-md font-semibold">
                  <Link
                    href="mailto:support@openpanel.dev"
                    className="group-hover:underline"
                  >
                    Contact us
                  </Link>
                </div>
              </div>
            </div>

            <div className="self-center text-sm text-muted-foreground mt-4 text-center max-w-[70%] w-full">
              <strong className="text-background/80 dark:text-foreground/80">
                All features are included upfront - no hidden costs.
              </strong>{' '}
              You choose how many events to track each month.
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
