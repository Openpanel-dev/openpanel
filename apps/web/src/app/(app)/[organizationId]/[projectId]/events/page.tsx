import { Suspense } from 'react';
import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { getExists } from '@/server/pageExists';

import { getEventList, getEvents } from '@mixan/db';

import { StickyBelowHeader } from '../layout-sticky-below-header';
import { EventList } from './event-list';

interface PageProps {
  params: {
    projectId: string;
    organizationId: string;
  };
  searchParams: {
    cursor?: string;
  };
}
export default async function Page({
  params: { projectId, organizationId },
  searchParams: { cursor },
}: PageProps) {
  await getExists(organizationId, projectId);
  const events = await getEventList({
    cursor,
    projectId,
    take: 50,
  });

  return (
    <PageLayout title="Events" organizationSlug={organizationId}>
      <StickyBelowHeader className="p-4 flex justify-between">
        <OverviewFiltersDrawer projectId={projectId} />
      </StickyBelowHeader>
      <EventList data={events} />
    </PageLayout>
  );
}
