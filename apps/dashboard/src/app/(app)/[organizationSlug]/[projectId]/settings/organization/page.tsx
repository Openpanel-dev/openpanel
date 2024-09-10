import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { PageTabs, PageTabsLink } from '@/components/page-tabs';
import { Padding } from '@/components/ui/padding';
import { auth } from '@clerk/nextjs/server';
import { ShieldAlertIcon } from 'lucide-react';
import { notFound } from 'next/navigation';
import { parseAsStringEnum } from 'nuqs/server';

import { db } from '@openpanel/db';

import EditOrganization from './edit-organization';
import InvitesServer from './invites';
import MembersServer from './members';

interface PageProps {
  params: {
    organizationId: string;
  };
  searchParams: Record<string, string>;
}

export default async function Page({
  params: { organizationId },
  searchParams,
}: PageProps) {
  const tab = parseAsStringEnum(['org', 'members', 'invites'])
    .withDefault('org')
    .parseServerSide(searchParams.tab);
  const session = auth();
  const organization = await db.organization.findUnique({
    where: {
      id: organizationId,
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
    (member) => member.userId === session.userId,
  );

  const hasAccess = member?.role === 'org:admin';

  if (!hasAccess) {
    return (
      <FullPageEmptyState icon={ShieldAlertIcon} title="No access">
        You do not have access to this page. You need to be an admin of this
        organization to access this page.
      </FullPageEmptyState>
    );
  }

  return (
    <Padding>
      <PageTabs className="mb-4">
        <PageTabsLink href={'?tab=org'} isActive={tab === 'org'}>
          Organization
        </PageTabsLink>
        <PageTabsLink href={'?tab=members'} isActive={tab === 'members'}>
          Members
        </PageTabsLink>
        <PageTabsLink href={'?tab=invites'} isActive={tab === 'invites'}>
          Invites
        </PageTabsLink>
      </PageTabs>

      {tab === 'org' && <EditOrganization organization={organization} />}
      {tab === 'members' && <MembersServer organizationId={organizationId} />}
      {tab === 'invites' && <InvitesServer organizationId={organizationId} />}
    </Padding>
  );
}
