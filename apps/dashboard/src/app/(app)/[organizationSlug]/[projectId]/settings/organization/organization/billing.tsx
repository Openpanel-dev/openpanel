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
import { showConfirm } from '@/modals';
import { api } from '@/trpc/client';
import type { IServiceOrganization } from '@openpanel/db';
import { useOpenPanel } from '@openpanel/nextjs';
import type { IPolarPrice } from '@openpanel/payments';
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
  const op = useOpenPanel();
  const [customerSessionToken, setCustomerSessionToken] = useQueryState(
    'customer_session_token',
  );
  const productsQuery = api.subscription.products.useQuery({
    organizationId: organization.id,
  });

  useWS(`/live/organization/${organization.id}`, (event) => {
    router.refresh();
  });

  const [recurringInterval, setRecurringInterval] = useState<'year' | 'month'>(
    (organization.subscriptionInterval as 'year' | 'month') || 'month',
  );

  const products = useMemo(() => {
    return (productsQuery.data || [])
      .filter((product) => product.recurringInterval === recurringInterval)
      .filter((product) => product.prices.some((p) => p.amountType !== 'free'));
  }, [productsQuery.data, recurringInterval]);

  useEffect(() => {
    if (organization.subscriptionInterval) {
      setRecurringInterval(
        organization.subscriptionInterval as 'year' | 'month',
      );
    }
  }, [organization.subscriptionInterval]);

  useEffect(() => {
    if (customerSessionToken) {
      op.track('subscription_created');
    }
  }, [customerSessionToken]);

  function renderBillingTable() {
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
        className="w-full max-w-full [&_.cell:first-child]:pl-4 [&_.cell:last-child]:pr-4"
        columnClassName="!h-auto"
        data={products}
        keyExtractor={(item) => item.id}
        columns={[
          {
            name: 'Tier',
            className: 'text-left',
            width: 'auto',
            render(item) {
              return <div className="font-medium">{item.name}</div>;
            },
          },
          {
            name: 'Price',
            width: 'auto',
            render(item) {
              const price = item.prices[0];
              if (!price) {
                return null;
              }

              if (price.amountType === 'free') {
                return null;
                // return (
                //   <div className="row gap-2 whitespace-nowrap">
                //     <div className="items-center text-right justify-end gap-4 flex-1 row">
                //       <span>Free</span>
                //       <CheckoutButton
                //         disabled={item.disabled}
                //         key={price.id}
                //         price={price}
                //         organization={organization}
                //         projectId={projectId}
                //       />
                //     </div>
                //   </div>
                // );
              }

              if (price.amountType !== 'fixed') {
                return null;
              }

              return (
                <div className="row gap-2 whitespace-nowrap">
                  <div className="items-center text-right justify-end gap-4 flex-1 col md:row">
                    <span>
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: price.priceCurrency,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1,
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
            {renderBillingTable()}
            <div className="text-center p-4 border-t">
              <p>Do you need higher limits? </p>
              <p>
                Reach out to{' '}
                <a
                  className="underline font-medium"
                  href="mailto:hello@openpanel.dev"
                >
                  hello@openpanel.dev
                </a>{' '}
                and we'll help you out.
              </p>
            </div>
          </div>
        </WidgetBody>
      </Widget>
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
  const op = useOpenPanel();
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

  const isCanceled =
    organization.subscriptionStatus === 'active' &&
    isCurrentPrice &&
    organization.subscriptionCanceledAt;
  const isActive =
    organization.subscriptionStatus === 'active' && isCurrentPrice;

  return (
    <Tooltiper
      content={disabled}
      tooltipClassName="max-w-xs"
      side="left"
      disabled={!disabled}
    >
      <Button
        disabled={disabled !== null || (isActive && !isCanceled)}
        key={price.id}
        onClick={() => {
          const createCheckout = () =>
            checkout.mutate({
              projectId,
              organizationId: organization.id,
              productPriceId: price!.id,
              productId: price.productId,
            });

          if (organization.subscriptionStatus === 'active') {
            showConfirm({
              title: 'Are you sure?',
              text: `You're about the change your subscription.`,
              onConfirm: () => {
                op.track('subscription_change');
                createCheckout();
              },
            });
          } else {
            op.track('subscription_checkout', {
              product: price.productId,
            });
            createCheckout();
          }
        }}
        loading={checkout.isLoading}
        className="w-28"
        variant={isActive ? 'outline' : 'default'}
      >
        {isCanceled ? 'Reactivate' : isActive ? 'Active' : 'Activate'}
      </Button>
    </Tooltiper>
  );
}
