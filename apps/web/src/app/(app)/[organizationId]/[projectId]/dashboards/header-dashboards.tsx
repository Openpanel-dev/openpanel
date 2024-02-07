'use client';

import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { PlusIcon } from 'lucide-react';

import { StickyBelowHeader } from '../layout-sticky-below-header';

export function HeaderDashboards() {
  return (
    <StickyBelowHeader>
      <div className="p-4 flex justify-between items-center">
        <div />
        <Button
          icon={PlusIcon}
          onClick={() => {
            pushModal('AddDashboard');
          }}
        >
          <span className="max-sm:hidden">Create dashboard</span>
          <span className="sm:hidden">Dashboard</span>
        </Button>
      </div>
    </StickyBelowHeader>
  );
}
