'use client';

import { differenceInHours } from 'date-fns';
import { useEffect, useState } from 'react';

import { ProjectLink } from '@/components/links';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ModalHeader } from '@/modals/Modal/Container';
import type { IServiceOrganization } from '@openpanel/db';
import { useOpenPanel } from '@openpanel/nextjs';
import { FREE_PRODUCT_IDS } from '@openpanel/payments';
import Billing from './settings/organization/organization/billing';
import SideEffectsFreePlan from './side-effects-free-plan';
import SideEffectsTimezone from './side-effects-timezone';
import SideEffectsTrial from './side-effects-trial';

interface SideEffectsProps {
  organization: IServiceOrganization;
}

export default function SideEffects({ organization }: SideEffectsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Avoids hydration errors
  if (!mounted) {
    return null;
  }

  return (
    <>
      <SideEffectsTimezone organization={organization} />
      <SideEffectsTrial organization={organization} />
      <SideEffectsFreePlan organization={organization} />
    </>
  );
}
