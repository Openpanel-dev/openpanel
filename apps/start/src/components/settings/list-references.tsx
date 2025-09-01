'use client';

import { ReferencesTable } from '@/components/references/table';
import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { PlusIcon } from 'lucide-react';

interface ListReferencesProps {
  data: RouterOutputs['reference']['getReferences'];
}

export default function ListReferences({ data }: ListReferencesProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Event References</h2>
          <p className="text-muted-foreground">
            Manage event references and custom event definitions.
          </p>
        </div>
        <Button icon={PlusIcon} onClick={() => pushModal('AddReference')}>
          <span className="max-sm:hidden">Create reference</span>
          <span className="sm:hidden">Reference</span>
        </Button>
      </div>
      <ReferencesTable data={data} />
    </div>
  );
}
