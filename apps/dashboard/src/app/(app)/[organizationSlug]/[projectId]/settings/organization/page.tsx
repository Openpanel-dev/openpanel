import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { ShieldAlertIcon } from 'lucide-react';
import { notFound } from 'next/navigation';

import { getOrganizationBySlug } from '@openpanel/db';

import EditOrganization from './edit-organization';
import InvitesServer from './invites';
import MembersServer from './members';

interface PageProps {
  params: {
    organizationSlug: string;
  };
}

export default async function Page({
  params: { organizationSlug },
}: PageProps) {
  const organization = await getOrganizationBySlug(organizationSlug);
  const session = auth();
  const memberships = await clerkClient.users.getOrganizationMembershipList({
    userId: session.userId!,
  });

  if (!organization) {
    return notFound();
  }

  const member = memberships.data.find(
    (membership) => membership.organization.id === organization.id
  );

  if (!member) {
    return notFound();
  }

  const hasAccess = member.role === 'org:admin';

  return (
    <>
      <PageLayout
        title={organization.name}
        organizationSlug={organizationSlug}
      />
      {hasAccess ? (
        <div className="grid gap-8 p-4 lg:grid-cols-2">
          <EditOrganization organization={organization} />
          <div className="col-span-2">
            <MembersServer organizationSlug={organizationSlug} />
          </div>
          <div className="col-span-2">
            <InvitesServer organizationSlug={organizationSlug} />
          </div>
        </div>
      ) : (
        <>
          <FullPageEmptyState icon={ShieldAlertIcon} title="No access">
            You do not have access to this page. You need to be an admin of this
            organization to access this page.
          </FullPageEmptyState>
        </>
      )}
    </>
  );
}
