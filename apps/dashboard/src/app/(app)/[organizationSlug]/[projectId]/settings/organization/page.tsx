import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { auth } from '@clerk/nextjs/server';
import { ShieldAlertIcon } from 'lucide-react';
import { notFound } from 'next/navigation';

import { db } from '@openpanel/db';

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
  const session = auth();
  const organization = await db.organization.findUnique({
    where: {
      id: organizationSlug,
      members: {
        some: {
          userId: session.userId,
        },
      },
    },
    include: {
      members: {
        select: {
          role: true,
          userId: true,
        },
      },
    },
  });

  if (!organization) {
    return notFound();
  }

  const member = organization.members.find(
    (member) => member.userId === session.userId
  );

  const hasAccess = member?.role === 'org:admin';

  return (
    <>
      <PageLayout title={organization.name} />
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
