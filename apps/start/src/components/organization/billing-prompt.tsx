import { PageHeader } from '@/components/page-header';
import { Button, LinkButton } from '@/components/ui/button';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { op } from '@/utils/op';
import type { IServiceOrganization } from '@openpanel/db';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BarChart3Icon,
  DollarSignIcon,
  InfinityIcon,
  type LucideIcon,
  MapIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

const COPY = {
  expired: {
    title: 'Subscription expired',
    description:
      'Reactivate your subscription to regain access to your analytics data and insights.',
    body: [
      "Your subscription has expired, but your data is safe and waiting for you. Reactivate now to continue tracking your users' behavior and making data-driven decisions.",
      "Don't let gaps in your analytics cost you valuable insights. Every day without data is a day of missed opportunities to understand and grow your audience.",
    ],
  },
  trialEnded: {
    title: 'Trial ended',
    description:
      'Upgrade now to keep the momentum going and continue optimizing your product.',
    body: [
      "You've experienced the power of OpenPanel. Keep the insights flowing and maintain continuity in your analytics data.",
      "We'll still process all your incoming events for the coming 30 days.",
    ],
  },
  freePlan: {
    title: 'Free plan is removed',
    description:
      "We've removed the free plan to focus on delivering exceptional value to our paid customers.",
    body: [
      "We've evolved our offering to provide better features, faster performance, and dedicated support. Our paid plans ensure we can continue building the analytics platform you deserve.",
      'Simple, transparent pricing with no hidden fees. Pay for what you use, and scale as you grow. Your investment in analytics pays for itself through better decisions and improved user experiences.',
    ],
  },
};

export default function BillingPrompt({
  organization,
  type,
}: {
  organization: IServiceOrganization;
  type: keyof typeof COPY;
}) {
  const number = useNumber();
  const trpc = useTRPC();
  const { data: products, isLoading: isLoadingProducts } = useQuery(
    trpc.subscription.products.queryOptions({
      organizationId: organization.id,
    }),
  );
  const checkout = useMutation(
    trpc.subscription.checkout.mutationOptions({
      onSuccess(data) {
        if (data?.url) {
          window.location.href = data.url;
        } else {
          toast.success('Subscription updated', {
            description: 'It might take a few seconds to update',
          });
        }
      },
    }),
  );
  const { title, description, body } = COPY[type];

  const bestProductFit = products?.find(
    (product) =>
      typeof product.metadata.eventsLimit === 'number' &&
      product.metadata.eventsLimit >=
        organization.subscriptionPeriodEventsCount,
  );

  useEffect(() => {
    op.track('billing_prompt_viewed', {
      type,
    });
  }, []);

  const price = bestProductFit
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'usd',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }).format(
        bestProductFit.prices[0] && 'priceAmount' in bestProductFit.prices[0]
          ? bestProductFit.prices[0].priceAmount / 100
          : 0,
      )
    : null;

  return (
    <div className="p-4 md:p-20 max-w-7xl mx-auto">
      <div className="border rounded-lg overflow-hidden bg-def-200 p-2 items-center">
        <div className="md:row">
          <div className="p-6 bg-background rounded-md border col gap-4 flex-1">
            <PageHeader title={title} description={description} />
            {body.map((paragraph) => (
              <p key={paragraph}>
                {paragraph.replace(
                  '{{events}}',
                  number.format(
                    organization.subscriptionPeriodEventsCount ?? 0,
                  ),
                )}
              </p>
            ))}
            <div className="col gap-2 mt-auto">
              {bestProductFit && (
                <div className="text-sm text-muted-foreground leading-normal">
                  Based on your usage (
                  {number.format(
                    organization.subscriptionPeriodEventsCount ?? 0,
                  )}{' '}
                  events) we recommend upgrading <br />
                  to the <strong>{bestProductFit.name}</strong> plan for{' '}
                  <strong>{price}</strong> per month.
                </div>
              )}
              <div className="col md:row gap-2">
                <Button
                  size="lg"
                  loading={isLoadingProducts}
                  disabled={!bestProductFit}
                  onClick={() => {
                    if (bestProductFit) {
                      op.track('billing_prompt_upgrade_clicked', {
                        type,
                        price:
                          bestProductFit.prices[0] &&
                          'priceAmount' in bestProductFit.prices[0]
                            ? bestProductFit.prices[0].priceAmount / 100
                            : 0,
                      });
                      checkout.mutate({
                        organizationId: organization.id,
                        productPriceId: bestProductFit.prices[0].id,
                        productId: bestProductFit.id,
                      });
                    }
                  }}
                >
                  Upgrade to {price}
                </Button>
                <LinkButton
                  size="lg"
                  variant="outline"
                  to="/$organizationId/billing"
                  params={{ organizationId: organization.id }}
                >
                  View pricing
                </LinkButton>
              </div>
            </div>
          </div>
          <div className="shrink-0 flex-1 p-6 gap-4 col min-w-[200px] max-w-[300px]">
            <Point icon={DollarSignIcon}>Plans start at just $2.5/month</Point>
            <Point icon={InfinityIcon}>
              Unlimited reports, members and projects
            </Point>
            <Point icon={BarChart3Icon}>Advanced funnels and conversions</Point>
            <Point icon={MapIcon}>Real-time analytics</Point>
            <Point icon={TrendingUpIcon}>
              Track KPIs and custom events (revenue soon)
            </Point>
            <Point icon={ShieldCheckIcon}>
              Privacy-focused and GDPR compliant
            </Point>
          </div>
        </div>
      </div>
    </div>
  );
}

function Point({
  icon: Icon,
  children,
}: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="row gap-2">
      <div className="size-6 shrink-0 center-center rounded-full bg-amber-500 text-white">
        <Icon className="size-4" />
      </div>
      <h3 className="font-medium mt-[1.5px]">{children}</h3>
    </div>
  );
}
