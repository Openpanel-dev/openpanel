import PageLayout from '@/app/(app)/page-layout';
import { getOrganizationBySlug } from '@/server/services/organization.service';

import EditOrganization from './edit-organization';
import InvitedUsers from './invited-users';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const organization = await getOrganizationBySlug(organizationId);
  const invites = [];

  return (
    <PageLayout title={organization.name}>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EditOrganization organization={organization} />
        <InvitedUsers invites={invites} organizationId={organizationId} />
      </div>
    </PageLayout>
  );
}
