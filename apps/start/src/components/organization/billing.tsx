import { Button } from '@/components/ui/button';
import { useNumber } from '@/hooks/use-numer-formatter';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal, useOnPushModal } from '@/modals';
import { formatDate } from '@/utils/date';
import type { IServiceOrganization } from '@openpanel/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInDays } from 'date-fns';
import { useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Progress } from '../ui/progress';
import { Widget, WidgetBody, WidgetHead } from '../widget';
import { BillingFaq } from './billing-faq';
import BillingUsage from './billing-usage';

type Props = {
  organization: IServiceOrganization;
};

export default function Billing({ organization }: Props) {
  const [success, setSuccess] = useQueryState('customer_session_token');
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const number = useNumber();

  const productsQuery = useQuery(
    trpc.subscription.products.queryOptions({
      organizationId: organization.id,
    }),
  );

  const currentProductQuery = useQuery(
    trpc.subscription.getCurrent.queryOptions({
      organizationId: organization.id,
    }),
  );

  const portalMutation = useMutation(
    trpc.subscription.portal.mutationOptions({
      onSuccess(data) {
        if (data?.url) {
          window.location.href = data.url;
        }
      },
      onError(error) {
        toast.error(error.message);
      },
    }),
  );

  useWS(`/live/organization/${organization.id}`, () => {
    queryClient.invalidateQueries(trpc.organization.pathFilter());
  });

  const [recurringInterval, setRecurringInterval] = useState<'year' | 'month'>(
    (organization.subscriptionInterval as 'year' | 'month') || 'month',
  );

  const products = useMemo(() => {
    return (productsQuery.data || [])
      .filter((product) => product.recurringInterval === recurringInterval)
      .filter((product) => product.prices.some((p) => p.amountType !== 'free'));
  }, [productsQuery.data, recurringInterval]);

  const currentProduct = currentProductQuery.data ?? null;
  const currentPrice = currentProduct?.prices.flatMap((p) =>
    p.type === 'recurring' && p.amountType === 'fixed' ? [p] : [],
  )[0];

  const renderStatus = () => {
    if (organization.isActive && organization.subscriptionCurrentPeriodEnd) {
      return (
        <p>
          Your subscription will be renewed on{' '}
          {formatDate(organization.subscriptionCurrentPeriodEnd)}
        </p>
      );
    }

    if (organization.isCanceled && organization.subscriptionCanceledAt) {
      return (
        <p>
          Your subscription was canceled on{' '}
          {formatDate(organization.subscriptionCanceledAt)}
        </p>
      );
    }
    if (
      organization.isWillBeCanceled &&
      organization.subscriptionCurrentPeriodEnd
    ) {
      return (
        <p>
          Your subscription will be canceled on{' '}
          {formatDate(organization.subscriptionCurrentPeriodEnd)}
        </p>
      );
    }

    if (
      organization.subscriptionStatus === 'expired' &&
      organization.subscriptionCurrentPeriodEnd
    ) {
      return (
        <p>
          Your subscription expired on{' '}
          {formatDate(organization.subscriptionCurrentPeriodEnd)}
        </p>
      );
    }
    if (
      organization.subscriptionStatus === 'trialing' &&
      organization.subscriptionEndsAt
    ) {
      return (
        <p>
          Your trial will end on {formatDate(organization.subscriptionEndsAt)}
        </p>
      );
    }

    return null;
  };

  useEffect(() => {
    if (success) {
      pushModal('BillingSuccess');
    }
  }, [success]);

  // Clear query state when modal is closed
  useOnPushModal('BillingSuccess', (open) => {
    if (!open) {
      setSuccess(null);
    }
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="col gap-8">
        {currentProduct && currentPrice ? (
          <Widget className="w-full">
            <WidgetHead className="flex items-center justify-between gap-4">
              <div className="flex-1 title truncate">{currentProduct.name}</div>
              <div className="text-lg">
                <span className="font-bold">
                  {number.currency(currentPrice.priceAmount / 100)}
                </span>
                <span className="text-muted-foreground">
                  {' / '}
                  {recurringInterval === 'year' ? 'year' : 'month'}
                </span>
              </div>
            </WidgetHead>
            <WidgetBody>
              {renderStatus()}
              <div className="col mt-4">
                <div className="font-semibold mb-2">
                  {number.format(organization.subscriptionPeriodEventsCount)} /{' '}
                  {number.format(Number(currentProduct.metadata.eventsLimit))}
                </div>
                <Progress
                  value={
                    (organization.subscriptionPeriodEventsCount /
                      Number(currentProduct.metadata.eventsLimit)) *
                    100
                  }
                  size="sm"
                />
                <div className="row justify-between mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      portalMutation.mutate({ organizationId: organization.id })
                    }
                  >
                    <svg
                      className="size-4 mr-2"
                      width="300"
                      height="300"
                      viewBox="0 0 300 300"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <g clip-path="url(#clip0_1_4)">
                        <path
                          fill-rule="evenodd"
                          clip-rule="evenodd"
                          d="M66.4284 274.26C134.876 320.593 227.925 302.666 274.258 234.219C320.593 165.771 302.666 72.7222 234.218 26.3885C165.77 -19.9451 72.721 -2.0181 26.3873 66.4297C-19.9465 134.877 -2.01938 227.927 66.4284 274.26ZM47.9555 116.67C30.8375 169.263 36.5445 221.893 59.2454 256.373C18.0412 217.361 7.27564 150.307 36.9437 92.318C55.9152 55.2362 87.5665 29.3937 122.5 18.3483C90.5911 36.7105 62.5549 71.8144 47.9555 116.67ZM175.347 283.137C211.377 272.606 244.211 246.385 263.685 208.322C293.101 150.825 282.768 84.4172 242.427 45.2673C264.22 79.7626 269.473 131.542 252.631 183.287C237.615 229.421 208.385 265.239 175.347 283.137ZM183.627 266.229C207.945 245.418 228.016 210.604 236.936 168.79C251.033 102.693 232.551 41.1978 195.112 20.6768C214.97 47.3945 225.022 99.2902 218.824 157.333C214.085 201.724 200.814 240.593 183.627 266.229ZM63.7178 131.844C49.5155 198.43 68.377 260.345 106.374 280.405C85.9962 254.009 75.5969 201.514 81.8758 142.711C86.5375 99.0536 99.4504 60.737 116.225 35.0969C92.2678 55.983 72.5384 90.4892 63.7178 131.844ZM199.834 149.561C200.908 217.473 179.59 272.878 152.222 273.309C124.853 273.742 101.797 219.039 100.724 151.127C99.6511 83.2138 120.968 27.8094 148.337 27.377C175.705 26.9446 198.762 81.648 199.834 149.561Z"
                          fill="currentColor"
                        />
                      </g>
                      <defs>
                        <clipPath id="clip0_1_4">
                          <rect width="300" height="300" fill="white" />
                        </clipPath>
                      </defs>
                    </svg>
                    Customer portal
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      pushModal('SelectBillingPlan', {
                        organization,
                        currentProduct,
                      })
                    }
                  >
                    {organization.isWillBeCanceled
                      ? 'Reactivate subscription'
                      : 'Change subscription'}
                  </Button>
                </div>
              </div>
            </WidgetBody>
          </Widget>
        ) : (
          <Widget className="w-full">
            <WidgetHead className="flex items-center justify-between">
              <div className="font-bold text-lg flex-1">
                {organization.isTrial
                  ? 'Get started'
                  : 'No active subscription'}
              </div>
              <div className="text-lg">
                <span className="">
                  {organization.isTrial ? '30 days free trial' : ''}
                </span>
              </div>
            </WidgetHead>
            <WidgetBody>
              {organization.isTrial && organization.subscriptionEndsAt ? (
                <p>
                  Your trial will end on{' '}
                  {formatDate(organization.subscriptionEndsAt)} (
                  {differenceInDays(
                    organization.subscriptionEndsAt,
                    new Date(),
                  ) + 1}{' '}
                  days left)
                </p>
              ) : (
                <p>
                  Your trial has expired. Please upgrade your account to
                  continue using Openpanel.
                </p>
              )}
              <div className="col mt-4">
                <div className="font-semibold mb-2">
                  {number.format(organization.subscriptionPeriodEventsCount)} /{' '}
                  {number.format(
                    Number(organization.subscriptionPeriodEventsLimit),
                  )}
                </div>
                <Progress
                  value={
                    (organization.subscriptionPeriodEventsCount /
                      Number(organization.subscriptionPeriodEventsLimit)) *
                    100
                  }
                  size="sm"
                />
                <div className="row justify-end mt-4">
                  <Button
                    size="sm"
                    onClick={() =>
                      pushModal('SelectBillingPlan', {
                        organization,
                        currentProduct,
                      })
                    }
                  >
                    Upgrade
                  </Button>
                </div>
              </div>
            </WidgetBody>
          </Widget>
        )}

        <BillingUsage organization={organization} />
      </div>

      <BillingFaq />
    </div>
  );
}
