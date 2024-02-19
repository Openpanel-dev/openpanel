'use client';

import { Combobox } from '@/components/ui/combobox';
import { useAppParams } from '@/hooks/useAppParams';
import { usePathname, useRouter } from 'next/navigation';

import type { getProjectsByOrganizationSlug } from '@mixan/db';

interface LayoutProjectSelectorProps {
  projects: Awaited<ReturnType<typeof getProjectsByOrganizationSlug>>;
}
export default function LayoutProjectSelector({
  projects,
}: LayoutProjectSelectorProps) {
  const router = useRouter();
  const { organizationId, projectId } = useAppParams();
  const pathname = usePathname() || '';

  return (
    <div>
      <Combobox
        align="end"
        className="w-auto min-w-0 max-sm:max-w-[100px]"
        placeholder={'Select project'}
        onChange={(value) => {
          // If we are on a page with only organizationId and projectId (as params)
          // we know its safe to just replace the current projectId
          // since the rest of the url is to a static page
          // e.g. /[organizationId]/[projectId]/events
          if (organizationId && projectId) {
            router.push(pathname.replace(projectId, value));
          } else {
            router.push(`/${organizationId}/${value}`);
          }
        }}
        value={projectId}
        items={
          projects.map((item) => ({
            label: item.name,
            value: item.id,
          })) ?? []
        }
      />
    </div>
  );
}
