import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltiper } from '@/components/ui/tooltip';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useAppParams } from '@/hooks/use-app-params';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import { op } from '@/utils/op';
import type { IServiceOrganization } from '@openpanel/db';
import type { IPolarPrice } from '@openpanel/payments';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type Props = {
  organization: IServiceOrganization;
};

export default function Billing({ organization }: Props) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const [customerSessionToken, setCustomerSessionToken] = useQueryState(
    'customer_session_token',
  );
  const productsQuery = useQuery(
    trpc.subscription.products.queryOptions({
      organizationId: organization.id,
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

  const [selectedProductIndex, setSelectedProductIndex] = useState<number>(0);

  // Check if organization has a custom product
  const hasCustomProduct = useMemo(() => {
    return products.some((product) => product.metadata?.custom === true);
  }, [products]);

  // Preferred default selection when there is no active subscription
  const defaultSelectedIndex = useMemo(() => {
    const defaultIndex = products.findIndex(
      (product) => product.metadata?.eventsLimit === 100_000,
    );
    return defaultIndex >= 0 ? defaultIndex : 0;
  }, [products]);

  // Find current subscription index (-1 when no subscription)
  const currentSubscriptionIndex = useMemo(() => {
    if (!organization.subscriptionProductId) {
      return -1;
    }
    return products.findIndex(
      (product) => product.id === organization.subscriptionProductId,
    );
  }, [products, organization.subscriptionProductId]);

  // Check if selected index is the "custom" option (beyond available products)
  const isCustomOption = selectedProductIndex >= products.length;

  // Find the highest event limit to make the custom option dynamic
  const highestEventLimit = useMemo(() => {
    const limits = products
      .map((product) => product.metadata?.eventsLimit)
      .filter((limit): limit is number => typeof limit === 'number');
    return Math.max(...limits, 0);
  }, [products]);

  // Format the custom option label dynamically
  const customOptionLabel = useMemo(() => {
    if (highestEventLimit >= 1_000_000) {
      return `+${(highestEventLimit / 1_000_000).toFixed(0)}M`;
    }
    if (highestEventLimit >= 1_000) {
      return `+${(highestEventLimit / 1_000).toFixed(0)}K`;
    }
    return `+${highestEventLimit}`;
  }, [highestEventLimit]);

  // Set initial slider position to current subscription or default plan when none
  useEffect(() => {
    if (currentSubscriptionIndex >= 0) {
      setSelectedProductIndex(currentSubscriptionIndex);
    } else {
      setSelectedProductIndex(defaultSelectedIndex);
    }
  }, [currentSubscriptionIndex, defaultSelectedIndex]);

  const selectedProduct = products[selectedProductIndex];
  const isUpgrade = selectedProductIndex > currentSubscriptionIndex;
  const isDowngrade = selectedProductIndex < currentSubscriptionIndex;
  const isCurrentPlan = selectedProductIndex === currentSubscriptionIndex;

  function renderBillingSlider() {
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

    if (hasCustomProduct) {
      return (
        <div className="p-8 text-center">
          <div className="text-muted-foreground">
            Not applicable since custom product
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Select your plan</span>
            <span className="text-sm text-muted-foreground">
              {selectedProduct?.name || 'No plan selected'}
            </span>
          </div>

          <Slider
            value={[selectedProductIndex]}
            onValueChange={([value]) => setSelectedProductIndex(value)}
            min={0}
            max={products.length} // +1 for the custom option
            step={1}
            className="w-full"
            disabled={hasCustomProduct}
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            {products.map((product, index) => {
              const eventsLimit = product.metadata?.eventsLimit;
              return (
                <div key={product.id} className="text-center">
                  <div className="font-medium">
                    {eventsLimit && typeof eventsLimit === 'number'
                      ? `${(eventsLimit / 1000).toFixed(0)}K`
                      : 'Free'}
                  </div>
                  <div className="text-xs">events</div>
                </div>
              );
            })}
            {/* Add the custom option label */}
            <div className="text-center">
              <div className="font-medium">{customOptionLabel}</div>
              <div className="text-xs">events</div>
            </div>
          </div>
        </div>

        {(selectedProduct || isCustomOption) && (
          <div className="border rounded-lg p-4 space-y-4">
            {isCustomOption ? (
              // Custom option content
              <>
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold">Custom Plan</h3>
                    <p className="text-sm text-muted-foreground">
                      {customOptionLabel} events per {recurringInterval}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold">
                      Custom Pricing
                    </span>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    Need higher limits?
                  </p>
                  <p className="text-sm">
                    Reach out to{' '}
                    <a
                      className="underline font-medium"
                      href="mailto:hello@openpanel.dev"
                    >
                      hello@openpanel.dev
                    </a>{' '}
                    and we'll help you with a custom quota.
                  </p>
                </div>
              </>
            ) : (
              // Regular product content
              <>
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold">{selectedProduct.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedProduct.metadata?.eventsLimit
                        ? `${selectedProduct.metadata.eventsLimit.toLocaleString()} events per ${recurringInterval}`
                        : 'Free tier'}
                    </p>
                  </div>
                  <div className="text-right">
                    {selectedProduct.prices[0]?.amountType === 'free' ? (
                      <span className="text-lg font-semibold">Free</span>
                    ) : (
                      <span className="text-lg font-semibold">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency:
                            selectedProduct.prices[0]?.priceCurrency || 'USD',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        }).format(
                          (selectedProduct.prices[0] &&
                          'priceAmount' in selectedProduct.prices[0]
                            ? selectedProduct.prices[0].priceAmount
                            : 0) / 100,
                        )}
                        <span className="text-sm text-muted-foreground">
                          {' / '}
                          {recurringInterval === 'year' ? 'year' : 'month'}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {!isCurrentPlan && selectedProduct.prices[0] && (
                  <div className="flex justify-end">
                    <CheckoutButton
                      disabled={selectedProduct.disabled}
                      key={selectedProduct.prices[0].id}
                      price={selectedProduct.prices[0]}
                      organization={organization}
                      buttonText={
                        isUpgrade
                          ? 'Upgrade'
                          : isDowngrade
                            ? 'Downgrade'
                            : 'Activate'
                      }
                    />
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="flex justify-end">
                    <Button variant="outline" disabled>
                      Current Plan
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
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
          <div className="-m-4">{renderBillingSlider()}</div>
        </WidgetBody>
      </Widget>
      <Dialog
        open={!!customerSessionToken}
        onOpenChange={(open) => {
          setCustomerSessionToken(null);
          if (!open) {
            queryClient.invalidateQueries(trpc.organization.pathFilter());
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
  disabled,
  buttonText,
}: {
  price: IPolarPrice;
  organization: IServiceOrganization;
  disabled?: string | null;
  buttonText?: string;
}) {
  const trpc = useTRPC();
  const isCurrentPrice = organization.subscriptionPriceId === price.id;
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
        loading={checkout.isPending}
        className="w-28"
        variant={isActive ? 'outline' : 'default'}
      >
        {buttonText ||
          (isCanceled ? 'Reactivate' : isActive ? 'Active' : 'Activate')}
      </Button>
    </Tooltiper>
  );
}
