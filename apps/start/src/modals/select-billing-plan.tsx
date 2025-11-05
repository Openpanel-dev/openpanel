import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { op } from '@/utils/op';
import type { IServiceOrganization } from '@openpanel/db';
import type { IPolarProduct } from '@openpanel/payments';
import { current } from '@reduxjs/toolkit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ShuffleIcon } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface Props {
  organization: IServiceOrganization;
  currentProduct: IPolarProduct | null;
}

const getPrice = (product: IPolarProduct) => {
  return product.prices[0] && 'priceAmount' in product.prices[0]
    ? product.prices[0].priceAmount / 100
    : 0;
};

export default function SelectBillingPlan({
  organization,
  currentProduct,
}: Props) {
  const number = useNumber();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const productsQuery = useQuery(
    trpc.subscription.products.queryOptions({
      organizationId: organization.id,
    }),
  );
  const [recurringInterval, setRecurringInterval] = useState<'year' | 'month'>(
    (organization.subscriptionInterval as 'year' | 'month') || 'month',
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    organization.subscriptionProductId || null,
  );
  const products = productsQuery.data || [];
  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  );

  const checkoutMutation = useMutation(
    trpc.subscription.checkout.mutationOptions({
      onSuccess(data) {
        if (data?.url) {
          window.location.href = data.url;
        } else {
          queryClient.invalidateQueries(
            trpc.organization.get.queryOptions({
              organizationId: organization.id,
            }),
          );

          queryClient.invalidateQueries(
            trpc.subscription.getCurrent.queryOptions({
              organizationId: organization.id,
            }),
          );
          toast.success('Subscription updated', {
            description: 'It might take a few seconds to update',
          });
          popModal();
        }
      },
      onError(error) {
        toast.error(error.message);
      },
    }),
  );

  const cancelSubscription = useMutation(
    trpc.subscription.cancelSubscription.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries(
          trpc.organization.get.queryOptions({
            organizationId: organization.id,
          }),
        );
        queryClient.invalidateQueries(
          trpc.subscription.getCurrent.queryOptions({
            organizationId: organization.id,
          }),
        );
        toast.success('Subscription canceled', {
          description: 'It might take a few seconds to update',
        });
        popModal();
      },
      onError(error) {
        toast.error(error.message);
      },
    }),
  );

  const handleCheckout = () => {
    if (!selectedProduct) return;
    op.track('subscription_checkout_started', {
      organizationId: organization.id,
      limit: selectedProduct.metadata.eventsLimit,
      price: getPrice(selectedProduct),
    });
    checkoutMutation.mutate({
      organizationId: organization.id,
      productPriceId: selectedProduct.prices[0].id,
      productId: selectedProduct.id,
    });
  };

  const handleCancelSubscription = () => {
    if (!selectedProduct) return;
    op.track('subscription_canceled', {
      organizationId: organization.id,
      limit: selectedProduct.metadata.eventsLimit,
      price: getPrice(selectedProduct),
    });
    cancelSubscription.mutate({
      organizationId: organization.id,
    });
  };

  const renderAction = () => {
    if (!selectedProduct) {
      return null;
    }

    const isCurrentProduct = selectedProduct.id === currentProduct?.id;

    if (isCurrentProduct && organization.isActive) {
      return (
        <Button
          className="w-full mt-4"
          variant="destructive"
          size="lg"
          onClick={handleCancelSubscription}
        >
          Cancel subscription
        </Button>
      );
    }

    const payLabel = (() => {
      if (
        organization.isCanceled ||
        organization.isWillBeCanceled ||
        organization.isExpired
      ) {
        return isCurrentProduct
          ? 'Reactivate subscription'
          : 'Change subscription';
      }

      if (currentProduct) {
        return 'Change subscription';
      }

      return 'Pay with Polar';
    })();

    return (
      <button
        type="button"
        className="w-full mt-4 rounded-lg overflow-hidden hover:translate-y-[-1px] transition-all group"
        onClick={handleCheckout}
      >
        {currentProduct && (
          <div className="row justify-between p-2 px-4 border-t border-l border-r border-border rounded-t-lg bg-def-200 group-hover:bg-def-100 transition-colors line-through">
            <span>{currentProduct?.name}</span>
            <span>{number.currency(getPrice(currentProduct))}</span>
          </div>
        )}
        <div
          className={cn(
            'row justify-between p-2 px-4 border-t border-l border-r border-border bg-def-200 group-hover:bg-def-100 transition-colors',
            !currentProduct && 'rounded-t-lg',
          )}
        >
          <span>{selectedProduct.name}</span>
          <span>{number.currency(getPrice(selectedProduct))}</span>
        </div>
        <div className="center-center gap-4 row bg-primary text-primary-foreground p-4 group-hover:bg-primary/90 transition-colors">
          <svg
            className="size-6"
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
          <span className="font-semibold">{payLabel}</span>
        </div>
      </button>
    );
  };

  return (
    <ModalContent>
      <ModalHeader title="Select a billing plan" />
      <div className="col gap-4">
        {currentProduct && (
          <div className="font-medium">
            Your current usage is{' '}
            {number.format(organization.subscriptionPeriodEventsCount)} out of{' '}
            {number.format(Number(currentProduct?.metadata.eventsLimit))}{' '}
            events.{' '}
            <span className="text-muted-foreground">
              You cannot downgrade if your usage exceeds the limit of the new
              plan.
            </span>
          </div>
        )}
        <div className="row items-center justify-between gap-2 -mb-2">
          <div className="font-medium">
            {recurringInterval === 'year' ? (
              'Switch to monthly'
            ) : (
              <>
                Switch to yearly and get{' '}
                <span className="underline text-emerald-500">
                  2 months for free
                </span>
              </>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() =>
              setRecurringInterval((p) => (p === 'year' ? 'month' : 'year'))
            }
          >
            {recurringInterval === 'year' ? 'Monthly' : 'Yearly'}
            <ShuffleIcon className="size-4 ml-2" />
          </Button>
        </div>
      </div>
      <div className="col divide-y divide-border border rounded-lg overflow-hidden">
        {products
          .filter((product) =>
            product.prices.some((p) => p.amountType !== 'free'),
          )
          .filter((product) => product.metadata.eventsLimit)
          .filter((product) => product.recurringInterval === recurringInterval)
          .map((product) => {
            const price = getPrice(product);

            const limit = product.metadata.eventsLimit
              ? Number(product.metadata.eventsLimit)
              : 0;

            const isProductDisabled =
              limit > 0 &&
              organization.subscriptionPeriodEventsCount >= limit &&
              !!product.disabled;

            return (
              <button
                key={product.id}
                type="button"
                disabled={isProductDisabled}
                className={cn(
                  'row justify-between p-4 py-3 hover:bg-def-100',
                  currentProduct?.id === product.id &&
                    selectedProductId !== product.id &&
                    'text-muted-foreground line-through',
                  isProductDisabled && 'opacity-50 !cursor-not-allowed',
                )}
                onClick={() => setSelectedProductId(product.id)}
              >
                <span className={'font-medium'}>{product.name}</span>
                <div className="row items-center gap-2">
                  <span className="font-bold">{number.currency(price)}</span>
                  {selectedProductId === product.id && (
                    <div className="size-4 center-center rounded-full bg-emerald-600 text-primary-foreground">
                      <CheckIcon className="size-2" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
      </div>
      {renderAction()}
    </ModalContent>
  );
}
