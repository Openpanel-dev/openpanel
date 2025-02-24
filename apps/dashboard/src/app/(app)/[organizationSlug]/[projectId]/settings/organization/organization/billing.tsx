'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tooltiper } from '@/components/ui/tooltip';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { WidgetTable } from '@/components/widget-table';
import { useAppParams } from '@/hooks/useAppParams';
import useWS from '@/hooks/useWS';
import { api } from '@/trpc/client';
import type { IServiceOrganization } from '@openpanel/db';
import type { IPolarPrice } from '@openpanel/payments';
import { format } from 'date-fns';
import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type Props = {
  organization: IServiceOrganization;
};

export default function Billing({ organization }: Props) {
  const router = useRouter();
  const { projectId } = useAppParams();
  const [customerSessionToken, setCustomerSessionToken] = useQueryState(
    'customer_session_token',
  );
  const productsQuery = api.subscription.products.useQuery({
    organizationId: organization.id,
  });
  const portalMutation = api.subscription.portal.useMutation({
    onSuccess(data) {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
  });

  useWS(`/live/organization/${organization.id}`, (event) => {
    router.refresh();
  });

  const [recurringInterval, setRecurringInterval] = useState<'year' | 'month'>(
    (organization.subscriptionInterval as 'year' | 'month') || 'month',
  );

  const products = useMemo(() => {
    return (productsQuery.data || []).filter(
      (product) => product.recurringInterval === recurringInterval,
    );
  }, [productsQuery.data, recurringInterval]);

  useEffect(() => {
    if (organization.subscriptionInterval) {
      setRecurringInterval(
        organization.subscriptionInterval as 'year' | 'month',
      );
    }
  }, [organization.subscriptionInterval]);

  function render() {
    if (productsQuery.isLoading) {
      return (
        <div className="center-center p-8">
          <Loader2Icon className="animate-spin" />
        </div>
      );
    }
    if (productsQuery.isError) {
      return (
        <div className="center-center p-8 font-medium">
          Issues loading all tiers
        </div>
      );
    }
    return (
      <WidgetTable
        className="w-full max-w-full [&_td]:text-left"
        data={products}
        keyExtractor={(item) => item.id}
        columns={[
          {
            name: 'Tier',
            render(item) {
              return <div className="font-medium">{item.name}</div>;
            },
            className: 'w-full',
          },
          {
            name: 'Price',
            render(item) {
              const price = item.prices[0];
              if (!price) {
                return null;
              }

              if (price.amountType === 'free') {
                return (
                  <div className="row gap-2 whitespace-nowrap">
                    <div className="items-center text-right justify-end gap-4 flex-1 row">
                      <span>Free</span>
                      <CheckoutButton
                        disabled={item.disabled}
                        key={price.id}
                        price={price}
                        organization={organization}
                        projectId={projectId}
                      />
                    </div>
                  </div>
                );
              }

              if (price.amountType !== 'fixed') {
                return null;
              }

              return (
                <div className="row gap-2 whitespace-nowrap">
                  <div className="items-center text-right justify-end gap-4 flex-1 row">
                    <span>
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: price.priceCurrency,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(price.priceAmount / 100)}
                      {' / '}
                      {recurringInterval === 'year' ? 'year' : 'month'}
                    </span>
                    <CheckoutButton
                      disabled={item.disabled}
                      key={price.id}
                      price={price}
                      organization={organization}
                      projectId={projectId}
                    />
                  </div>
                </div>
              );
            },
          },
        ]}
      />
    );
  }

  return (
    <>
      <div>
        <Widget className="w-full">
          <WidgetHead className="flex items-center justify-between">
            <span className="title">Billing</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {recurringInterval === 'year'
                  ? 'Yearly (2 months free)'
                  : 'Monthly'}
              </span>
              <Switch
                checked={recurringInterval === 'year'}
                onCheckedChange={(checked) =>
                  setRecurringInterval(checked ? 'year' : 'month')
                }
              />
            </div>
          </WidgetHead>
          <WidgetBody>
            <div className="-m-4">
              {organization.isTrial && organization.subscriptionEndsAt && (
                <div className="p-4 py-2 bg-orange-500 text-white font-medium">
                  <p>
                    Your organization is on a free trial. It ends on{' '}
                    {format(organization.subscriptionEndsAt, 'PPP')}
                  </p>
                </div>
              )}
              {organization.isExpired && organization.subscriptionEndsAt && (
                <div className="p-4 py-2 bg-red-500 text-white font-medium">
                  <p>
                    Your subscription has expired. You can reactivate it by
                    choosing a new plan below.
                  </p>
                  <p>
                    It expired on{' '}
                    {format(organization.subscriptionEndsAt, 'PPP')}
                  </p>
                </div>
              )}
              {organization.subscriptionStatus === 'active' &&
                organization.subscriptionCanceledAt &&
                organization.subscriptionEndsAt && (
                  <div className="p-4 py-2 bg-red-500 text-white font-medium">
                    <p>
                      You have canceled your subscription. You can reactivate it
                      by choosing a new plan below.
                    </p>
                    <p>
                      It'll expire on{' '}
                      {format(organization.subscriptionEndsAt, 'PPP')}
                    </p>
                  </div>
                )}
              {render()}
            </div>
          </WidgetBody>
        </Widget>
        <button
          className="text-center mt-2 w-full hover:underline"
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
      </div>
      <Dialog
        open={!!customerSessionToken}
        onOpenChange={(open) => {
          setCustomerSessionToken(null);
          if (!open) {
            router.refresh();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Subscription created</DialogTitle>
          <DialogDescription>
            We have registered your subscription. It'll be activated within a
            couple of seconds.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button>OK</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CheckoutButton({
  price,
  organization,
  projectId,
  disabled,
}: {
  price: IPolarPrice;
  organization: IServiceOrganization;
  projectId: string;
  disabled?: string | null;
}) {
  const isCurrentPrice = organization.subscriptionPriceId === price.id;
  const checkout = api.subscription.checkout.useMutation({
    onSuccess(data) {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.success('Subscription updated', {
          description: 'It might take a few seconds to update',
        });
      }
    },
  });
  const cancelSubscription = api.subscription.cancelSubscription.useMutation({
    onSuccess(res) {
      toast.success('Subscription cancelled', {
        description: 'It might take a few seconds to update',
      });
    },
    onError(error) {
      toast.error(error.message);
    },
  });

  const isCanceled =
    organization.subscriptionStatus === 'active' &&
    isCurrentPrice &&
    organization.subscriptionCanceledAt;
  const isActive =
    organization.subscriptionStatus === 'active' && isCurrentPrice;
  const isBuyable = !isCanceled && !isActive;

  return (
    <Tooltiper
      content={disabled}
      tooltipClassName="max-w-xs"
      side="left"
      disabled={!disabled}
    >
      <Button
        disabled={disabled !== null && isBuyable}
        key={price.id}
        onClick={() => {
          if (isBuyable || isCanceled) {
            checkout.mutate({
              projectId,
              organizationId: organization.id,
              productPriceId: price!.id,
              productId: price.productId,
            });
          } else if (isActive) {
            cancelSubscription.mutate({
              organizationId: organization.id,
            });
          }
        }}
        variant={
          isCanceled
            ? 'default'
            : isActive
              ? 'ghost'
              : isBuyable
                ? 'cta'
                : 'default'
        }
        loading={cancelSubscription.isLoading || checkout.isLoading}
      >
        {isCanceled
          ? 'Reactivate'
          : isActive
            ? 'Cancel subscription'
            : isBuyable
              ? 'Activate'
              : 'default'}
      </Button>
    </Tooltiper>
  );
}
