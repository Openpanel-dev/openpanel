import type { IServiceOrganization } from '@openpanel/db';
import type { ICancellationReason } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/date';
import { op } from '@/utils/op';

export interface CancelSubscriptionProps {
  organization: IServiceOrganization;
  // Runs after a successful outcome (pause, discount, or cancel) so the modal
  // that opened the flow (e.g. SelectBillingPlan) can close itself too.
  onComplete?: () => void;
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

export default function CancelSubscription({
  organization,
  onComplete,
}: CancelSubscriptionProps) {
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

  const finish = () => {
    popModal('CancelSubscription');
    onComplete?.();
  };

  const pauseMutation = useMutation(
    trpc.subscription.pauseSubscription.mutationOptions({
      onSuccess(data) {
        invalidate();
        toast.success('Subscription paused', {
          description: `Billing stops at the end of your current period and resumes on ${formatDate(data.resumesAt)}. Your events keep flowing in.`,
        });
        finish();
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
            '30% off your next 12 invoices, starting with the next billing cycle.',
        });
        finish();
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
        finish();
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
      <ModalContent>
        <ModalHeader
          text="Before you go — what's the main reason? It genuinely helps us improve."
          title="Cancel subscription"
        />
        <RadioGroup
          className="col gap-2"
          onValueChange={(value) => setReason(value as ICancellationReason)}
          value={reason ?? undefined}
        >
          {REASONS.map((item) => (
            <Label
              className={cn(
                'row cursor-pointer items-center gap-3 rounded-md border p-3 font-normal transition-colors hover:bg-def-100',
                reason === item.value && 'border-foreground/30 bg-def-100'
              )}
              key={item.value}
            >
              <RadioGroupItem value={item.value} />
              {item.label}
            </Label>
          ))}
        </RadioGroup>
        <Textarea
          className="mt-4"
          onChange={(event) => setComment(event.target.value)}
          placeholder="Anything you want to add? (optional)"
          value={comment}
        />
        <ButtonContainer>
          <Button
            onClick={() => popModal('CancelSubscription')}
            variant="outline"
          >
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
      </ModalContent>
    );
  }

  if (step === 'pause') {
    return (
      <ModalContent>
        <ModalHeader
          text="Pause your subscription: billing stops at the end of your current period, we keep collecting your events, and everything is exactly where you left it when you come back."
          title="Take a break instead?"
        />
        <div className="row gap-2">
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
        <p className="mt-2 text-muted-foreground text-sm">
          Billing automatically resumes after the pause — or resume earlier any
          time from the billing page. You pay nothing while paused.
        </p>
        <ButtonContainer>
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
      </ModalContent>
    );
  }

  return (
    <ModalContent>
      <ModalHeader
        text="We'd love to keep you around. Stay on your current plan and get 30% off every invoice for the next 12 months, starting with your next billing cycle."
        title="One last thing — 30% off for a year"
      />
      <ButtonContainer>
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
          No thanks, cancel my subscription
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
    </ModalContent>
  );
}
