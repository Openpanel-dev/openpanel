'use client';

import { StickyBelowHeader } from '@/app/(app)/[organizationId]/[projectId]/layout-sticky-below-header';
import { DataTable } from '@/components/DataTable';
import { columns } from '@/components/projects/table';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import { PlusIcon } from 'lucide-react';

import type { getProjectsByOrganizationSlug } from '@openpanel/db';

interface ListProjectsProps {
  projects: Awaited<ReturnType<typeof getProjectsByOrganizationSlug>>;
}
export default function ListProjects({ projects }: ListProjectsProps) {
  const organizationId = useAppParams().organizationId;
  return (
    <>
      <StickyBelowHeader>
        <div className="p-4 flex items-center justify-between">
          <div />
          <Button
            icon={PlusIcon}
            onClick={() =>
              pushModal('AddProject', {
                organizationId,
              })
            }
          >
            <span className="max-sm:hidden">Create project</span>
            <span className="sm:hidden">Project</span>
          </Button>
        </div>
      </StickyBelowHeader>
      <div className="p-4">
        <DataTable data={projects} columns={columns} />
      </div>
    </>
  );
}
