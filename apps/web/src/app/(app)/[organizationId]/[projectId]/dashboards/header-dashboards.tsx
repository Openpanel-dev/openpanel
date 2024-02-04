'use client';

import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { PlusIcon } from 'lucide-react';

import { StickyBelowHeader } from '../../../layout-sticky-below-header';

interface HeaderDashboardsProps {
  projectId: string;
}

export function HeaderDashboards({ projectId }: HeaderDashboardsProps) {
  return (
    <StickyBelowHeader>
      <div className="p-4 flex justify-between items-center">
        <div />
        <Button
          icon={PlusIcon}
          onClick={() => {
            pushModal('AddDashboard', {
              projectId,
            });
          }}
        >
          <span className="max-sm:hidden">Create dashboard</span>
          <span className="sm:hidden">Dashboard</span>
        </Button>
      </div>
    </StickyBelowHeader>
  );
}
