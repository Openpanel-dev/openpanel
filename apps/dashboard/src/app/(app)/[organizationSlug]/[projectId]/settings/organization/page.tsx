import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { PageTabs, PageTabsLink } from '@/components/page-tabs';
import { Padding } from '@/components/ui/padding';
import { ShieldAlertIcon } from 'lucide-react';
import { notFound } from 'next/navigation';
import { parseAsStringEnum } from 'nuqs/server';

import { auth } from '@openpanel/auth/nextjs';
import { db } from '@openpanel/db';

import InvitesServer from './invites';
import MembersServer from './members';
import Billing from './organization/billing';
import { BillingFaq } from './organization/billing-faq';
import CurrentSubscription from './organization/current-subscription';
import Organization from './organization/organization';
import Usage from './organization/usage';

interface PageProps {
  params: {
    organizationSlug: string;
  };
  searchParams: Record<string, string>;
}

export default async function Page({
  params: { organizationSlug: organizationId },
  searchParams,
}: PageProps) {
  const isBillingEnabled = process.env.NEXT_PUBLIC_SELF_HOSTED !== 'true';
  const tab = parseAsStringEnum(['org', 'billing', 'members', 'invites'])
    .withDefault('org')
    .parseServerSide(searchParams.tab);
  const session = await auth();
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
        {isBillingEnabled && (
          <PageTabsLink href={'?tab=billing'} isActive={tab === 'billing'}>
            Billing
          </PageTabsLink>
        )}
        <PageTabsLink href={'?tab=members'} isActive={tab === 'members'}>
          Members
        </PageTabsLink>
        <PageTabsLink href={'?tab=invites'} isActive={tab === 'invites'}>
          Invites
        </PageTabsLink>
      </PageTabs>

      {tab === 'org' && <Organization organization={organization} />}
      {tab === 'billing' && isBillingEnabled && (
        <div className="flex flex-col-reverse md:flex-row gap-8 max-w-screen-lg">
          <div className="col gap-8 w-full">
            <Billing organization={organization} />
            <Usage organization={organization} />
            <BillingFaq />
          </div>
          <CurrentSubscription organization={organization} />
        </div>
      )}
      {tab === 'members' && <MembersServer organizationId={organizationId} />}
      {tab === 'invites' && <InvitesServer organizationId={organizationId} />}
    </Padding>
  );
}
