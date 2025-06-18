import { cn } from '@/lib/utils';
import { CheckIcon, ChevronRightIcon, DollarSignIcon } from 'lucide-react';
import Link from 'next/link';
import { DoubleSwirl } from '../Swirls';
import { PricingSlider } from '../pricing-slider';
import { Section, SectionHeader } from '../section';
import { Tag } from '../tag';
import { Button } from '../ui/button';

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
      <div className="container relative z-10">
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

        <div className="grid md:grid-cols-[400px_1fr] gap-8">
          <div className="col gap-4">
            <h3 className="font-medium text-xl text-background/90 dark:text-foreground/90">
              Stop overpaying <br />
              for features
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

          <div className="col justify-between pt-14 gap-4">
            <PricingSlider />

            <div className="text-sm text-muted-foreground">
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
