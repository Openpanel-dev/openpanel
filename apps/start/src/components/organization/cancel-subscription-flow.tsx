import type { IServiceOrganization } from '@openpanel/db';
import type { ICancellationReason } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTRPC } from '@/integrations/trpc/react';
import { ModalHeader } from '@/modals/Modal/Container';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/date';
import { op } from '@/utils/op';

// The cancel flow lives inside the SelectBillingPlan modal as internal views
// (no stacked modals): reason -> pause offer -> discount offer -> cancel.

interface Props {
  organization: IServiceOrganization;
  // Back to the plan picker view.
  onBack: () => void;
  // A flow outcome happened (paused, discounted, or canceled) — close the modal.
  onComplete: () => void;
}

const REASONS: { value: ICancellationReason; label: string }[] = [
  { value: 'unused', label: "I'm not using it right now" },
  { value: 'too_expensive', label: "It's too expensive" },
  { value: 'missing_features', label: "It's missing features I need" },
  { value: 'switched_service', label: 'I switched to another service' },
  { value: 'too_complex', label: "It's too complicated" },
  { value: 'low_quality', label: "Quality didn't meet my expectations" },
  { value: 'customer_service', label: 'Unhappy with customer service' },
  { value: 'other', label: 'Other' },
];

const PAUSE_MONTHS = [1, 2, 3] as const;

type Step = 'reason' | 'pause' | 'discount';

export default function CancelSubscriptionFlow({
  organization,
  onBack,
  onComplete,
}: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('reason');
  const [reason, setReason] = useState<ICancellationReason | null>(null);
  const [comment, setComment] = useState('');
  const [pauseMonths, setPauseMonths] = useState<1 | 2 | 3>(1);

  const discountAvailable = !organization.subscriptionSaveDiscountAppliedAt;

  const invalidate = () => {
    queryClient.invalidateQueries(trpc.organization.pathFilter());
    queryClient.invalidateQueries(trpc.subscription.pathFilter());
  };

  const pauseMutation = useMutation(
    trpc.subscription.pauseSubscription.mutationOptions({
      onSuccess(data) {
        invalidate();
        toast.success('Subscription paused', {
          description: `Billing stops at the end of your current period and resumes on ${formatDate(data.resumesAt)}. Your events keep flowing in.`,
        });
        onComplete();
      },
      onError(error) {
        toast.error(error.message);
      },
    })
  );

  const discountMutation = useMutation(
    trpc.subscription.applySaveDiscount.mutationOptions({
      onSuccess() {
        invalidate();
        toast.success('Discount applied', {
          description:
            '30% off for the next 12 months, starting with your next billing cycle.',
        });
        onComplete();
      },
      onError(error) {
        toast.error(error.message);
      },
    })
  );

  const cancelMutation = useMutation(
    trpc.subscription.cancelSubscription.mutationOptions({
      onSuccess() {
        invalidate();
        toast.success('Subscription canceled', {
          description: organization.subscriptionEndsAt
            ? `Your subscription stays active until ${formatDate(organization.subscriptionEndsAt)}.`
            : 'It might take a few seconds to update',
        });
        onComplete();
      },
      onError(error) {
        toast.error(error.message);
      },
    })
  );

  const isPending =
    pauseMutation.isPending ||
    discountMutation.isPending ||
    cancelMutation.isPending;

  const cancelNow = () => {
    if (!reason) {
      return;
    }
    op.track('subscription_canceled', {
      organizationId: organization.id,
      reason,
    });
    cancelMutation.mutate({
      organizationId: organization.id,
      reason,
      comment: comment.trim() || undefined,
    });
  };

  if (step === 'reason') {
    return (
      <>
        <ModalHeader
          text="Before you go — what's the main reason? It genuinely helps us improve."
          title="Cancel subscription"
        />
        <div className="scrollbar-thin col min-h-0 flex-1 gap-4 overflow-y-auto">
          <div className="col shrink-0 divide-y divide-border overflow-hidden rounded-lg border">
            {REASONS.map((item) => (
              <button
                className={cn(
                  'row shrink-0 items-center justify-between p-4 py-3 text-left transition-colors hover:bg-def-100',
                  reason === item.value && 'bg-def-100'
                )}
                key={item.value}
                onClick={() => setReason(item.value)}
                type="button"
              >
                <span className="font-medium">{item.label}</span>
                {reason === item.value && (
                  <div className="center-center size-4 shrink-0 rounded-full bg-emerald-600 text-primary-foreground">
                    <CheckIcon className="size-2" />
                  </div>
                )}
              </button>
            ))}
          </div>
          <Textarea
            className="shrink-0"
            onChange={(event) => setComment(event.target.value)}
            placeholder="Anything you want to add? (optional)"
            value={comment}
          />
        </div>
        <ButtonContainer className="shrink-0 gap-2 [&>*]:flex-1">
          <Button onClick={onBack} variant="outline">
            Never mind
          </Button>
          <Button
            disabled={!reason}
            onClick={() => {
              op.track('cancel_reason_selected', {
                organizationId: organization.id,
                reason,
              });
              setStep('pause');
            }}
            variant="destructive"
          >
            Continue
          </Button>
        </ButtonContainer>
      </>
    );
  }

  if (step === 'pause') {
    return (
      <>
        <ModalHeader
          text="Pause your subscription: billing stops at the end of your current period, we keep collecting your events, and everything is exactly where you left it when you come back."
          title="Take a break instead?"
        />
        <div className="scrollbar-thin col min-h-0 flex-1 gap-3 overflow-y-auto">
          <div className="row shrink-0 gap-2">
            {PAUSE_MONTHS.map((months) => (
              <Button
                className="flex-1"
                key={months}
                onClick={() => setPauseMonths(months)}
                variant={pauseMonths === months ? 'default' : 'outline'}
              >
                {months} {months === 1 ? 'month' : 'months'}
              </Button>
            ))}
          </div>
          <p className="shrink-0 text-muted-foreground text-sm">
            Billing automatically resumes after the pause — or resume earlier
            any time from the billing page. You pay nothing while paused.
          </p>
        </div>
        <ButtonContainer className="shrink-0 gap-2 [&>*]:flex-1">
          <Button
            disabled={isPending}
            onClick={() => {
              op.track('cancel_pause_declined', {
                organizationId: organization.id,
                reason,
              });
              if (discountAvailable) {
                setStep('discount');
              } else {
                cancelNow();
              }
            }}
            variant="outline"
          >
            {discountAvailable ? 'No thanks' : 'No thanks, cancel'}
          </Button>
          <Button
            loading={pauseMutation.isPending}
            onClick={() => {
              op.track('cancel_pause_accepted', {
                organizationId: organization.id,
                reason,
                months: pauseMonths,
              });
              pauseMutation.mutate({
                organizationId: organization.id,
                months: pauseMonths,
              });
            }}
          >
            Pause for {pauseMonths} {pauseMonths === 1 ? 'month' : 'months'}
          </Button>
        </ButtonContainer>
      </>
    );
  }

  return (
    <>
      <ModalHeader
        text="We'd love to keep you around. Stay on your current plan and get 30% off for the next 12 months, starting with your next billing cycle."
        title="One last thing — 30% off for a year"
      />
      <div className="scrollbar-thin col min-h-0 flex-1 overflow-y-auto">
        <div className="row shrink-0 items-center gap-3 rounded-lg border bg-def-100 p-4">
          <span className="font-bold font-mono text-3xl text-emerald-600 dark:text-emerald-500">
            −30%
          </span>
          <span className="text-muted-foreground">
            for the next 12 months
          </span>
        </div>
      </div>
      <ButtonContainer className="shrink-0 gap-2 [&>*]:flex-1">
        <Button
          disabled={isPending}
          loading={cancelMutation.isPending}
          onClick={() => {
            op.track('cancel_discount_declined', {
              organizationId: organization.id,
              reason,
            });
            cancelNow();
          }}
          variant="outline"
        >
          Cancel subscription
        </Button>
        <Button
          loading={discountMutation.isPending}
          onClick={() => {
            op.track('cancel_discount_accepted', {
              organizationId: organization.id,
              reason,
            });
            discountMutation.mutate({ organizationId: organization.id });
          }}
        >
          Apply 30% discount
        </Button>
      </ButtonContainer>
    </>
  );
}
