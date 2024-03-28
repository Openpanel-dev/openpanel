import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { notFound } from 'next/navigation';

import { getInvites, getOrganizationBySlug } from '@openpanel/db';

import EditOrganization from './edit-organization';
import InvitesServer from './invites';
import MembersServer from './members';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({
  params: { organizationId: organizationSlug },
}: PageProps) {
  const organization = await getOrganizationBySlug(organizationSlug);

  if (!organization) {
    return notFound();
  }

  return (
    <PageLayout title={organization.name} organizationSlug={organizationSlug}>
      <div className="grid gap-8 p-4 lg:grid-cols-2">
        <EditOrganization organization={organization} />
        <div className="col-span-2">
          <MembersServer organizationSlug={organizationSlug} />
        </div>
        <div className="col-span-2">
          <InvitesServer organizationSlug={organizationSlug} />
        </div>
      </div>
    </PageLayout>
  );
}
