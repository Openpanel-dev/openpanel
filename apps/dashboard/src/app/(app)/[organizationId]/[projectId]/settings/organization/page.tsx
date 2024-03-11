import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { clerkClient } from '@clerk/nextjs';
import { notFound } from 'next/navigation';

import { getInvites, getOrganizationBySlug } from '@mixan/db';

import EditOrganization from './edit-organization';
import InvitedUsers from './invited-users';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const organization = await getOrganizationBySlug(organizationId);

  if (!organization) {
    return notFound();
  }

  const invites = await getInvites(organization.id);

  return (
    <PageLayout title={organization.name} organizationSlug={organizationId}>
      <div className="p-4 grid grid-cols-1 gap-4">
        <EditOrganization organization={organization} />
        <InvitedUsers invites={invites} />
      </div>
    </PageLayout>
  );
}
