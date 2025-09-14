'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useAppParams } from '@/hooks/use-app-params';
import { useNumber } from '@/hooks/use-numer-formatter';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import { cn } from '@/utils/cn';
import type { IServiceOrganization } from '@openpanel/db';
import { FREE_PRODUCT_IDS } from '@openpanel/payments';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  organization: IServiceOrganization;
};

export default function CurrentSubscription({ organization }: Props) {
  const { projectId } = useAppParams();
  const queryClient = useQueryClient();
  const number = useNumber();
  const trpc = useTRPC();
  const productQuery = useQuery(
    trpc.subscription.getCurrent.queryOptions({
      organizationId: organization.id,
    }),
  );
  const cancelSubscription = useMutation(
    trpc.subscription.cancelSubscription.mutationOptions({
      onSuccess(res) {
        toast.success('Subscription cancelled', {
          description: 'It might take a few seconds to update',
        });
      },
      onError(error) {
        toast.error(error.message);
      },
    }),
  );
  const portalMutation = useMutation(
    trpc.subscription.portal.mutationOptions({
      onSuccess(data) {
        if (data?.url) {
          window.location.href = data.url;
        }
      },
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

  useWS(`/live/organization/${organization.id}`, () => {
    queryClient.invalidateQueries(
      trpc.subscription.getCurrent.queryOptions({
        organizationId: organization.id,
      }),
    );
  });

  function render() {
    if (productQuery.isLoading) {
      return (
        <div className="center-center p-8">
          <Loader2Icon className="animate-spin" />
        </div>
      );
    }
    if (productQuery.isError) {
      return (
        <div className="center-center p-8 font-medium">
          Issues loading all tiers
        </div>
      );
    }

    if (!productQuery.data) {
      return (
        <div className="center-center p-8 font-medium">
          No subscription found
        </div>
      );
    }

    const product = productQuery.data;
    const price = product.prices[0]!;
    return (
      <>
        <div className="gap-4 col">
          {price.amountType === 'free' && (
            <Alert variant="warning">
              <AlertTitle>Free plan is removed</AlertTitle>
              <AlertDescription>
                We've removed the free plan. You can upgrade to a paid plan to
                continue using OpenPanel.
              </AlertDescription>
            </Alert>
          )}
          <div className="row justify-between">
            <div>Name</div>
            <div className="text-right font-medium">{product.name}</div>
          </div>
          {price.amountType === 'fixed' ? (
            <>
              <div className="row justify-between">
                <div>Price</div>
                <div className="text-right font-medium font-mono">
                  {number.currency(price.priceAmount / 100)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="row justify-between">
                <div>Price</div>
                <div className="text-right font-medium font-mono">FREE</div>
              </div>
            </>
          )}
          <div className="row justify-between">
            <div>Billing Cycle</div>
            <div className="text-right font-medium">
              {price.recurringInterval === 'month' ? 'Monthly' : 'Yearly'}
            </div>
          </div>
          {typeof product.metadata.eventsLimit === 'number' && (
            <div className="row justify-between">
              <div>Events per mount</div>
              <div className="text-right font-medium font-mono">
                {number.format(product.metadata.eventsLimit)}
              </div>
            </div>
          )}
        </div>
        {organization.subscriptionProductId &&
          !FREE_PRODUCT_IDS.includes(organization.subscriptionProductId) && (
            <div className="col gap-2">
              {organization.isWillBeCanceled || organization.isCanceled ? (
                <Button
                  loading={checkout.isPending}
                  onClick={() => {
                    checkout.mutate({
                      projectId,
                      organizationId: organization.id,
                      productPriceId: price!.id,
                      productId: price.productId,
                    });
                  }}
                >
                  Reactivate subscription
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  loading={cancelSubscription.isPending}
                  onClick={() => {
                    showConfirm({
                      title: 'Cancel subscription',
                      text: 'Are you sure you want to cancel your subscription?',
                      onConfirm() {
                        cancelSubscription.mutate({
                          organizationId: organization.id,
                        });
                      },
                    });
                  }}
                >
                  Cancel subscription
                </Button>
              )}
            </div>
          )}
      </>
    );
  }

  return (
    <div className="col gap-2 md:w-72 shrink-0">
      <Widget className="w-full">
        <WidgetHead className="flex items-center justify-between">
          <span className="title">Current Subscription</span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <div
                className={cn(
                  'h-3 w-3 animate-ping rounded-full bg-emerald-500 opacity-100 transition-all',
                  organization.isExceeded ||
                    organization.isExpired ||
                    (organization.subscriptionStatus !== 'active' &&
                      'bg-destructive'),
                  organization.isWillBeCanceled && 'bg-orange-400',
                )}
              />
              <div
                className={cn(
                  'absolute left-0 top-0 h-3 w-3 rounded-full bg-emerald-500 transition-all',
                  organization.isExceeded ||
                    organization.isExpired ||
                    (organization.subscriptionStatus !== 'active' &&
                      'bg-destructive'),
                  organization.isWillBeCanceled && 'bg-orange-400',
                )}
              />
            </div>
          </div>
        </WidgetHead>
        <WidgetBody className="col gap-8">
          {organization.isTrial && organization.subscriptionEndsAt && (
            <Alert variant="warning">
              <AlertTitle>Free trial</AlertTitle>
              <AlertDescription>
                Your organization is on a free trial. It ends on{' '}
                {format(organization.subscriptionEndsAt, 'PPP')}
              </AlertDescription>
            </Alert>
          )}
          {organization.isExpired && organization.subscriptionEndsAt && (
            <Alert variant="destructive">
              <AlertTitle>Subscription expired</AlertTitle>
              <AlertDescription>
                Your subscription has expired. You can reactivate it by choosing
                a new plan below.
              </AlertDescription>
              <AlertDescription>
                It expired on {format(organization.subscriptionEndsAt, 'PPP')}
              </AlertDescription>
            </Alert>
          )}
          {organization.isWillBeCanceled && (
            <Alert variant="warning">
              <AlertTitle>Subscription canceled</AlertTitle>
              <AlertDescription>
                You have canceled your subscription. You can reactivate it by
                choosing a new plan below.
              </AlertDescription>
              <AlertDescription className="font-medium">
                It'll expire on{' '}
                {format(organization.subscriptionEndsAt!, 'PPP')}
              </AlertDescription>
            </Alert>
          )}
          {organization.isCanceled && (
            <Alert variant="warning">
              <AlertTitle>Subscription canceled</AlertTitle>
              <AlertDescription>
                Your subscription was canceled on{' '}
                {format(organization.subscriptionCanceledAt!, 'PPP')}
              </AlertDescription>
            </Alert>
          )}
          {render()}
        </WidgetBody>
      </Widget>
      {organization.hasSubscription && (
        <button
          className="text-center mt-2 w-2/3 hover:underline self-center"
          type="button"
          onClick={() =>
            portalMutation.mutate({
              organizationId: organization.id,
            })
          }
        >
          Manage your subscription with
          <span className="font-medium ml-1">Polar Customer Portal</span>
        </button>
      )}
    </div>
  );
}
