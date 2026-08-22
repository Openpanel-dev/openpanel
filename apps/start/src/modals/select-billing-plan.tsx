import type { IServiceOrganization } from '@openpanel/db';
import type { IPolarProduct } from '@openpanel/payments';
import { useState } from 'react';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import BillingPlanPicker from '@/components/organization/billing-plan-picker';
import CancelSubscriptionFlow from '@/components/organization/cancel-subscription-flow';

interface Props {
  organization: IServiceOrganization;
  currentProduct: IPolarProduct | null;
  defaultInterval?: 'year' | 'month';
}

export default function SelectBillingPlan({
  organization,
  currentProduct,
  defaultInterval,
}: Props) {
  // Internal router: the cancel flow renders inside this modal instead of
  // stacking another modal on top.
  const [view, setView] = useState<'plans' | 'cancel'>('plans');

  return (
    <ModalContent className="!flex !flex-col !overflow-hidden">
      {view === 'plans' ? (
        <>
          <ModalHeader title="Select a billing plan" />
          <BillingPlanPicker
            currentProduct={currentProduct}
            defaultInterval={defaultInterval}
            onCancel={() => setView('cancel')}
            onComplete={popModal}
            organization={organization}
          />
        </>
      ) : (
        <CancelSubscriptionFlow
          onBack={() => setView('plans')}
          onComplete={popModal}
          organization={organization}
        />
      )}
    </ModalContent>
  );
}
