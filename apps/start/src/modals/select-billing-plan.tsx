import type { IServiceOrganization } from '@openpanel/core';
import type { IPolarProduct } from '@openpanel/payments';
import { useState } from 'react';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import BillingPlanPicker from '@/components/organization/billing-plan-picker';
import CancelSubscriptionFlow from '@/components/organization/cancel-subscription-flow';
import { useTranslation as useDashboardTranslation } from '@/i18n/provider';

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
  const { t: translateUi } = useDashboardTranslation();

  // Internal router: the cancel flow renders inside this modal instead of
  // stacking another modal on top.
  const [view, setView] = useState<'plans' | 'cancel'>('plans');

  return (
    <ModalContent bodyClassName="flex flex-col overflow-hidden">
      {view === 'plans' ? (
        <>
          <ModalHeader title={translateUi('Select a billing plan')} />
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
