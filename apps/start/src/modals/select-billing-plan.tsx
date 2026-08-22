import type { IServiceOrganization } from '@openpanel/db';
import type { IPolarProduct } from '@openpanel/payments';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import BillingPlanPicker from '@/components/organization/billing-plan-picker';

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
  return (
    <ModalContent className="!flex !flex-col !overflow-hidden">
      <ModalHeader title="Select a billing plan" />
      <BillingPlanPicker
        currentProduct={currentProduct}
        defaultInterval={defaultInterval}
        onComplete={popModal}
        organization={organization}
      />
    </ModalContent>
  );
}
