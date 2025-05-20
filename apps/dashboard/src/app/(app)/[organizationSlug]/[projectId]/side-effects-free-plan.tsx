'use client';

import { differenceInHours } from 'date-fns';
import { useEffect, useState } from 'react';

import { ProjectLink } from '@/components/links';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ModalHeader } from '@/modals/Modal/Container';
import type { IServiceOrganization } from '@openpanel/db';
import { useOpenPanel } from '@openpanel/nextjs';
import { FREE_PRODUCT_IDS } from '@openpanel/payments';
import Billing from './settings/organization/organization/billing';

interface SideEffectsProps {
  organization: IServiceOrganization;
}

export default function SideEffectsFreePlan({
  organization,
}: SideEffectsProps) {
  const op = useOpenPanel();
  const willEndInHours = organization.subscriptionEndsAt
    ? differenceInHours(organization.subscriptionEndsAt, new Date())
    : null;
  const [isFreePlan, setIsFreePlan] = useState<boolean>(
    !!organization.subscriptionProductId &&
      FREE_PRODUCT_IDS.includes(organization.subscriptionProductId),
  );

  useEffect(() => {
    if (isFreePlan) {
      op.track('free_plan_removed');
    }
  }, []);

  return (
    <Dialog open={isFreePlan} onOpenChange={setIsFreePlan}>
      <DialogContent className="max-w-xl">
        <ModalHeader
          onClose={() => setIsFreePlan(false)}
          title={'Free plan has been removed'}
          text={
            <>
              Please upgrade your plan to continue using OpenPanel. Select a
              tier which is appropriate for your needs or{' '}
              <ProjectLink
                href="/settings/organization?tab=billing"
                className="underline text-foreground"
              >
                manage billing
              </ProjectLink>
            </>
          }
        />
        <div className="-mx-4 mt-4">
          <Billing organization={organization} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
