import type { IServiceOrganization } from '@openpanel/core';
import EditOrganization from './edit-organization';

interface OrganizationProps {
  organization: IServiceOrganization;
}
export default function Organization({ organization }: OrganizationProps) {
  return (
    <section className="col max-w-screen-sm gap-8">
      <EditOrganization organization={organization} />
    </section>
  );
}
