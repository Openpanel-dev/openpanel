import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { getEventFilters } from '@/hooks/useEventQueryFilters';
import { getExists } from '@/server/pageExists';

import { getEventList, getEventsCount } from '@mixan/db';

import { StickyBelowHeader } from '../layout-sticky-below-header';
import { EventList } from './event-list';

interface PageProps {
  params: {
    projectId: string;
    organizationId: string;
  };
  searchParams: {
    cursor?: string;
    path?: string;
    device?: string;
    referrer?: string;
    referrerName?: string;
    referrerType?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    continent?: string;
    country?: string;
    region?: string;
    city?: string;
    browser?: string;
    browserVersion?: string;
    os?: string;
    osVersion?: string;
    brand?: string;
    model?: string;
  };
}

const nuqsOptions = {
  shallow: false,
};

function parseQueryAsNumber(value: string | undefined) {
  if (typeof value === 'string') {
    return parseInt(value, 10);
  }
  return undefined;
}

export default async function Page({
  params: { projectId, organizationId },
  searchParams,
}: PageProps) {
  const [events, count] = await Promise.all([
    getEventList({
      cursor: parseQueryAsNumber(searchParams.cursor),
      projectId,
      take: 50,
      filters: getEventFilters({
        path: searchParams.path ?? null,
        device: searchParams.device ?? null,
        referrer: searchParams.referrer ?? null,
        referrerName: searchParams.referrerName ?? null,
        referrerType: searchParams.referrerType ?? null,
        utmSource: searchParams.utmSource ?? null,
        utmMedium: searchParams.utmMedium ?? null,
        utmCampaign: searchParams.utmCampaign ?? null,
        utmContent: searchParams.utmContent ?? null,
        utmTerm: searchParams.utmTerm ?? null,
        continent: searchParams.continent ?? null,
        country: searchParams.country ?? null,
        region: searchParams.region ?? null,
        city: searchParams.city ?? null,
        browser: searchParams.browser ?? null,
        browserVersion: searchParams.browserVersion ?? null,
        os: searchParams.os ?? null,
        osVersion: searchParams.osVersion ?? null,
        brand: searchParams.brand ?? null,
        model: searchParams.model ?? null,
      }),
    }),
    getEventsCount({
      projectId,
      filters: getEventFilters({
        path: searchParams.path ?? null,
        device: searchParams.device ?? null,
        referrer: searchParams.referrer ?? null,
        referrerName: searchParams.referrerName ?? null,
        referrerType: searchParams.referrerType ?? null,
        utmSource: searchParams.utmSource ?? null,
        utmMedium: searchParams.utmMedium ?? null,
        utmCampaign: searchParams.utmCampaign ?? null,
        utmContent: searchParams.utmContent ?? null,
        utmTerm: searchParams.utmTerm ?? null,
        continent: searchParams.continent ?? null,
        country: searchParams.country ?? null,
        region: searchParams.region ?? null,
        city: searchParams.city ?? null,
        browser: searchParams.browser ?? null,
        browserVersion: searchParams.browserVersion ?? null,
        os: searchParams.os ?? null,
        osVersion: searchParams.osVersion ?? null,
        brand: searchParams.brand ?? null,
        model: searchParams.model ?? null,
      }),
    }),
    getExists(organizationId, projectId),
  ]);

  return (
    <PageLayout title="Events" organizationSlug={organizationId}>
      <StickyBelowHeader className="p-4 flex justify-between">
        <OverviewFiltersDrawer
          projectId={projectId}
          nuqsOptions={nuqsOptions}
        />
        <OverviewFiltersButtons
          className="p-0 justify-end"
          nuqsOptions={nuqsOptions}
        />
      </StickyBelowHeader>
      <EventList data={events} count={count} />
    </PageLayout>
  );
}
