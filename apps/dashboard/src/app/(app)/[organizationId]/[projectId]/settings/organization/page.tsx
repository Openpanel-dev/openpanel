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

  const invites = await getInvites(organization.id);

  return (
    <PageLayout title={organization.name} organizationSlug={organizationSlug}>
      <div className="p-4 grid grid-cols-1 gap-8">
        <EditOrganization organization={organization} />
        <MembersServer organizationSlug={organizationSlug} />
        <InvitesServer organizationSlug={organizationSlug} />
      </div>
    </PageLayout>
  );
}
