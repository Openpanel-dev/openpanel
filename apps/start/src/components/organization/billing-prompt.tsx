import type { IServiceOrganization } from '@openpanel/db';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { formatDate } from '@/utils/date';
import { op } from '@/utils/op';

const FEATURES = [
  'Plans start at $2.5/month',
  'Unlimited reports, members and projects',
  'Advanced funnels and conversions',
  'Real-time analytics',
  'Track KPIs and custom events',
  'Privacy-focused and GDPR compliant',
  'Revenue tracking',
  'Google Search Console integration',
];

type BadgeVariant = 'secondary' | 'warning' | 'info';

interface CopyVariant {
  badge: { label: string; variant: BadgeVariant };
  gradient: string;
  title: string;
  lead: string;
  dateLabel: string;
  action: 'checkout' | 'portal';
  cta: (plan: string, price: string) => string;
  note: string | null;
}

const COPY: Record<
  'expired' | 'trialEnded' | 'unpaid' | 'freePlan',
  CopyVariant
> = {
  trialEnded: {
    badge: { label: 'Trial ended', variant: 'secondary' },
    gradient: 'rgb(16 185 129)',
    title: 'Your 30 days are up',
    lead: 'Thanks for trying OpenPanel. Everything you set up is still here: your projects, your reports, and every event you tracked. Pick a plan and your dashboards are live again in about a minute.',
    dateLabel: 'Trial ended',
    action: 'checkout',
    cta: (plan, price) => `Continue with ${plan} for ${price}/month`,
    note: 'We keep collecting your incoming events for now, so nothing is lost while you decide.',
  },
  expired: {
    badge: { label: 'Subscription ended', variant: 'info' },
    gradient: 'rgb(59 130 246)',
    title: 'Your data is right where you left it',
    lead: "Your subscription ended, but we haven't deleted anything. Reactivate and your dashboards, reports, and events are back immediately.",
    dateLabel: 'Subscription ended',
    action: 'checkout',
    cta: (plan, price) => `Reactivate with ${plan} for ${price}/month`,
    note: null,
  },
  unpaid: {
    badge: { label: 'Payment issue', variant: 'warning' },
    gradient: 'rgb(245 158 11)',
    title: "Your last payment didn't go through",
    lead: "Usually it's an expired card or a bank block, and it takes a minute to fix. Update your payment method and your dashboards come straight back. Your data hasn't gone anywhere.",
    dateLabel: 'Paid through',
    action: 'portal',
    cta: () => 'Update payment method',
    note: null,
  },
  freePlan: {
    badge: { label: 'Plan change', variant: 'secondary' },
    gradient: 'rgb(16 185 129)',
    title: 'We retired the free plan',
    lead: "We'd rather run a small, sustainable service than a free one we can't support properly. Paid plans start at $2.5/month and your data carries over as-is.",
    dateLabel: 'Subscription ended',
    action: 'checkout',
    cta: (plan, price) => `Continue with ${plan} for ${price}/month`,
    note: null,
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
  const copy = COPY[type];
  const { data: products, isLoading: isLoadingProducts } = useQuery(
    trpc.subscription.products.queryOptions({
      organizationId: organization.id,
    })
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
    })
  );
  const portal = useMutation(
    trpc.subscription.portal.mutationOptions({
      onSuccess(data) {
        if (data?.url) {
          window.location.href = data.url;
        }
      },
      onError(error) {
        toast.error(error.message);
      },
    })
  );

  const eventsCount = organization.subscriptionPeriodEventsCount ?? 0;
  const bestProductFit = products
    ?.filter(
      (product) =>
        product.recurringInterval === 'month' &&
        !product.disabled &&
        typeof product.metadata.eventsLimit === 'number' &&
        product.prices.some((price) => price.amountType === 'fixed')
    )
    .find(
      (product) =>
        typeof product.metadata.eventsLimit === 'number' &&
        product.metadata.eventsLimit >= eventsCount
    );
  const bestPrice = bestProductFit?.prices.find(
    (price) => price.amountType === 'fixed'
  );
  const price =
    bestPrice && 'priceAmount' in bestPrice
      ? number.currency(bestPrice.priceAmount / 100)
      : null;

  useEffect(() => {
    op.track('billing_prompt_viewed', {
      type,
    });
  }, [type]);

  const renderCta = () => {
    if (copy.action === 'portal') {
      return (
        <Button
          className="w-full"
          loading={portal.isPending}
          onClick={() => {
            op.track('billing_prompt_upgrade_clicked', {
              type,
              cta: 'portal',
            });
            portal.mutate({ organizationId: organization.id });
          }}
          size="lg"
        >
          {copy.cta('', '')}
        </Button>
      );
    }

    if (!(bestProductFit && bestPrice && price)) {
      return (
        <Button asChild className="w-full" loading={isLoadingProducts} size="lg">
          <a href="mailto:hello@openpanel.dev?subject=Custom plan">
            Get a custom plan
          </a>
        </Button>
      );
    }

    return (
      <Button
        className="w-full"
        loading={isLoadingProducts || checkout.isPending}
        onClick={() => {
          op.track('billing_prompt_upgrade_clicked', {
            type,
            cta: 'checkout',
            price:
              'priceAmount' in bestPrice ? bestPrice.priceAmount / 100 : 0,
          });
          checkout.mutate({
            organizationId: organization.id,
            productPriceId: bestPrice.id,
            productId: bestProductFit.id,
          });
        }}
        size="lg"
      >
        {copy.cta(bestProductFit.name, price)}
      </Button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 md:py-20">
      <div className="relative overflow-hidden rounded-lg border bg-card">
        <div
          className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full opacity-20 blur-3xl"
          style={{
            background: `radial-gradient(circle, ${copy.gradient} 0%, transparent 70%)`,
          }}
        />

        <div className="col gap-3 p-6 md:p-8">
          <Badge variant={copy.badge.variant}>{copy.badge.label}</Badge>
          <h1 className="font-semibold text-2xl">{copy.title}</h1>
          <p className="text-muted-foreground leading-relaxed">{copy.lead}</p>
        </div>

        <div className="row gap-3 px-6 md:px-8">
          <div className="col flex-1 gap-1 rounded-md bg-def-200 p-4">
            <div className="font-bold font-mono text-2xl">
              {number.short(eventsCount)}
            </div>
            <div className="text-muted-foreground text-sm">
              Events tracked, all safe and stored
            </div>
          </div>
          {organization.subscriptionEndsAt && (
            <div className="col flex-1 gap-1 rounded-md bg-def-200 p-4">
              <div className="font-bold font-mono text-2xl">
                {formatDate(organization.subscriptionEndsAt)}
              </div>
              <div className="text-muted-foreground text-sm">
                {copy.dateLabel}
              </div>
            </div>
          )}
        </div>

        <div className="col gap-3 p-6 md:p-8">
          {copy.action === 'checkout' &&
            (bestProductFit ? (
              <p className="text-muted-foreground text-sm">
                Based on your usage, the{' '}
                <strong className="text-foreground">
                  {bestProductFit.name}
                </strong>{' '}
                plan covers you: up to{' '}
                {number.short(Number(bestProductFit.metadata.eventsLimit))}{' '}
                events per month for {price}.
              </p>
            ) : (
              !isLoadingProducts && (
                <p className="text-muted-foreground text-sm">
                  Your usage is above our standard plans, so let's set you up
                  with a custom one.
                </p>
              )
            ))}
          {renderCta()}
          {copy.note && (
            <p className="text-muted-foreground text-sm">{copy.note}</p>
          )}
          <div className="row items-center justify-between gap-2">
            <LinkButton
              params={{ organizationId: organization.id }}
              to="/$organizationId/billing"
              variant="outline"
            >
              See all plans
            </LinkButton>
            <a
              className="text-muted-foreground text-sm hover:underline"
              href="mailto:hello@openpanel.dev"
            >
              Questions? Email us
            </a>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div className="row items-center gap-2" key={feature}>
            <CheckIcon className="size-4 shrink-0 text-emerald-500" />
            <span className="text-muted-foreground text-sm">{feature}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
