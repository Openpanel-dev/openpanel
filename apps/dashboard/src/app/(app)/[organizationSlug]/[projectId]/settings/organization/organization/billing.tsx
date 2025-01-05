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
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { WidgetTable } from '@/components/widget-table';
import { useAppParams } from '@/hooks/useAppParams';
import { type RouterOutputs, api } from '@/trpc/client';
import type { IServiceOrganization } from '@openpanel/db';
import { format } from 'date-fns';
import { CheckCircleIcon, Loader2Icon } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';

type Props = {
  organization: IServiceOrganization;
};

export default function Billing({ organization }: Props) {
  const { projectId } = useAppParams();
  const [customerSessionToken, setCustomerSessionToken] = useQueryState(
    'customer_session_token',
  );
  const productsQuery = api.subscription.products.useQuery();
  const checkout = api.subscription.checkout.useMutation({
    onSuccess(data) {
      window.location.href = data.url;
    },
  });
  const currentPrice = useMemo(() => {
    return productsQuery.data
      ?.flatMap((product) => product.prices)
      .find((price) => price.id === organization.subscriptionPriceId);
  }, [productsQuery.data, organization.subscriptionPriceId]);

  const [recurringInterval, setRecurringInterval] = useState<'year' | 'month'>(
    'month',
  );

  const getPrice = (
    prices: RouterOutputs['subscription']['products'][number]['prices'],
  ) => {
    return prices.find(
      (price) =>
        price.amountType === 'fixed' &&
        // @ts-expect-error (recurringInterval is not typed)
        price.recurringInterval === recurringInterval,
    );
  };

  useEffect(() => {
    if (currentPrice) {
      setRecurringInterval(
        // @ts-expect-error (recurringInterval is not typed)
        currentPrice.recurringInterval,
      );
    }
  }, [currentPrice]);

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
        data={productsQuery.data}
        keyExtractor={(item) => item.id}
        columns={[
          {
            name: 'Tier',
            render(item) {
              return <div>{item.name}</div>;
            },
            className: 'w-full',
          },
          {
            name: 'Price',
            render(item) {
              const price = getPrice(item.prices);
              if (!price) {
                return null;
              }
              if (price.amountType !== 'fixed') {
                return null;
              }
              const isCurrentPrice =
                organization.subscriptionPriceId === price.id;
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
                    <Button
                      disabled={isCurrentPrice}
                      key={price.id}
                      onClick={() => {
                        checkout.mutate({
                          projectId,
                          organizationId: organization.id,
                          productPriceId: price!.id,
                        });
                      }}
                      variant={isCurrentPrice ? 'outline' : 'cta'}
                    >
                      {isCurrentPrice ? 'Current' : 'Activate'}
                    </Button>
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
                  It expired on {format(organization.subscriptionEndsAt, 'PPP')}
                </p>
              </div>
            )}
            {render()}
          </div>
        </WidgetBody>
      </Widget>
      <Dialog
        open={!!customerSessionToken}
        onOpenChange={() => setCustomerSessionToken(null)}
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
