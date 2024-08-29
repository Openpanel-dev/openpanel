'use client';

import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { PlusIcon } from 'lucide-react';

export function HeaderDashboards() {
  return (
    <div className="flex items-center justify-between p-4">
      <h1 className="text-3xl font-semibold">Dashboards</h1>
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
  );
}
