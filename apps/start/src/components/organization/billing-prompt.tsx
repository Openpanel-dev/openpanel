import type { IServiceOrganization } from '@openpanel/db';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { formatDate } from '@/utils/date';
import { op } from '@/utils/op';

const FEATURE_KEYS = [
  'prompt_feature_plans_start',
  'prompt_feature_unlimited',
  'prompt_feature_funnels',
  'prompt_feature_realtime',
  'prompt_feature_kpis',
  'prompt_feature_privacy',
  'prompt_feature_revenue',
  'prompt_feature_gsc',
];

type BadgeVariant = 'secondary' | 'warning' | 'info';

interface CopyVariant {
  badge: { labelKey: string; variant: BadgeVariant };
  gradient: string;
  titleKey: string;
  leadKey: string;
  dateLabelKey: string;
  action: 'checkout' | 'portal';
  ctaKey: string;
  noteKey: string | null;
}

const COPY: Record<
  'expired' | 'trialEnded' | 'unpaid' | 'freePlan',
  CopyVariant
> = {
  trialEnded: {
    badge: { labelKey: 'prompt_trial_ended_badge', variant: 'secondary' },
    gradient: 'rgb(16 185 129)',
    titleKey: 'prompt_trial_ended_title',
    leadKey: 'prompt_trial_ended_lead',
    dateLabelKey: 'prompt_trial_ended_date_label',
    action: 'checkout',
    ctaKey: 'prompt_trial_ended_cta',
    noteKey: 'prompt_trial_ended_note',
  },
  expired: {
    badge: { labelKey: 'prompt_expired_badge', variant: 'info' },
    gradient: 'rgb(59 130 246)',
    titleKey: 'prompt_expired_title',
    leadKey: 'prompt_expired_lead',
    dateLabelKey: 'prompt_expired_date_label',
    action: 'checkout',
    ctaKey: 'prompt_expired_cta',
    noteKey: null,
  },
  unpaid: {
    badge: { labelKey: 'prompt_unpaid_badge', variant: 'warning' },
    gradient: 'rgb(245 158 11)',
    titleKey: 'prompt_unpaid_title',
    leadKey: 'prompt_unpaid_lead',
    dateLabelKey: 'prompt_unpaid_date_label',
    action: 'portal',
    ctaKey: 'prompt_unpaid_cta',
    noteKey: null,
  },
  freePlan: {
    badge: { labelKey: 'prompt_free_plan_badge', variant: 'secondary' },
    gradient: 'rgb(16 185 129)',
    titleKey: 'prompt_free_plan_title',
    leadKey: 'prompt_free_plan_lead',
    dateLabelKey: 'prompt_free_plan_date_label',
    action: 'checkout',
    ctaKey: 'prompt_free_plan_cta',
    noteKey: null,
  },
};

export default function BillingPrompt({
  organization,
  type,
}: {
  organization: IServiceOrganization;
  type: keyof typeof COPY;
}) {
  const { t } = useTranslation();
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
          toast.success(t('billing.toast_subscription_updated'), {
            description: t('billing.toast_subscription_updated_description'),
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
          {t(`billing.${copy.ctaKey}`)}
        </Button>
      );
    }

    if (!(bestProductFit && bestPrice && price)) {
      return (
        <Button asChild className="w-full" loading={isLoadingProducts} size="lg">
          <a href="mailto:hello@openpanel.dev?subject=Custom plan">
            {t('billing.prompt_custom_plan_cta')}
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
        {t(`billing.${copy.ctaKey}`, { plan: bestProductFit.name, price })}
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
          <Badge variant={copy.badge.variant}>
            {t(`billing.${copy.badge.labelKey}`)}
          </Badge>
          <h1 className="font-semibold text-2xl">
            {t(`billing.${copy.titleKey}`)}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {t(`billing.${copy.leadKey}`)}
          </p>
        </div>

        <div className="row gap-3 px-6 md:px-8">
          <div className="col flex-1 gap-1 rounded-md bg-def-200 p-4">
            <div className="font-bold font-mono text-2xl">
              {number.short(eventsCount)}
            </div>
            <div className="text-muted-foreground text-sm">
              {t('billing.prompt_events_tracked_label')}
            </div>
          </div>
          {organization.subscriptionEndsAt && (
            <div className="col flex-1 gap-1 rounded-md bg-def-200 p-4">
              <div className="font-bold font-mono text-2xl">
                {formatDate(organization.subscriptionEndsAt)}
              </div>
              <div className="text-muted-foreground text-sm">
                {t(`billing.${copy.dateLabelKey}`)}
              </div>
            </div>
          )}
        </div>

        <div className="col gap-3 p-6 md:p-8">
          {copy.action === 'checkout' &&
            (bestProductFit ? (
              <p className="text-muted-foreground text-sm">
                {t('billing.prompt_usage_recommendation_prefix')}{' '}
                <strong className="text-foreground">
                  {bestProductFit.name}
                </strong>{' '}
                {t('billing.prompt_usage_recommendation_suffix', {
                  events: number.short(
                    Number(bestProductFit.metadata.eventsLimit)
                  ),
                  price,
                })}
              </p>
            ) : (
              !isLoadingProducts && (
                <p className="text-muted-foreground text-sm">
                  {t('billing.prompt_custom_plan_description')}
                </p>
              )
            ))}
          {renderCta()}
          {copy.noteKey && (
            <p className="text-muted-foreground text-sm">
              {t(`billing.${copy.noteKey}`)}
            </p>
          )}
          <div className="row items-center justify-between gap-2">
            <LinkButton
              params={{ organizationId: organization.id }}
              to="/$organizationId/billing"
              variant="outline"
            >
              {t('billing.prompt_see_all_plans')}
            </LinkButton>
            <a
              className="text-muted-foreground text-sm hover:underline"
              href="mailto:hello@openpanel.dev"
            >
              {t('billing.prompt_questions_email')}
            </a>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {FEATURE_KEYS.map((featureKey) => (
          <div className="row items-center gap-2" key={featureKey}>
            <CheckIcon className="size-4 shrink-0 text-emerald-500" />
            <span className="text-muted-foreground text-sm">
              {t(`billing.${featureKey}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
