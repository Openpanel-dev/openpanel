'use client';

import type { IServiceOrganization } from '@openpanel/db';
import EditOrganization from './edit-organization';

interface OrganizationProps {
  organization: IServiceOrganization;
}
export default function Organization({ organization }: OrganizationProps) {
  return (
    <section className="max-w-screen-sm col gap-8">
      <EditOrganization organization={organization} />
    </section>
  );
}
