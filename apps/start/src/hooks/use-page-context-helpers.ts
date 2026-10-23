import type { ChatLaunchHint } from '@openpanel/core/modules/assistant/assistant.constants';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { usePageContext } from '@/contexts/page-context';

type RangePage = Extract<
  ChatLaunchHint['page'],
  'overview' | 'insights' | 'pages' | 'seo' | 'events' | 'realtime'
>;

/** Pages with the shared date-range picker. */
export function useRangePageContext(page: RangePage) {
  const { range, startDate, endDate, interval } = useOverviewOptions();
  usePageContext({
    page,
    range,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    interval: interval ?? undefined,
  });
}

/** Detail pages: the entity the user is looking at. */
export function useEntityPageContext(
  page: 'profile' | 'session' | 'group',
  ids: Pick<ChatLaunchHint, 'profileId' | 'sessionId' | 'groupId'>
) {
  usePageContext({ page, ...ids });
}

export function useDashboardPageContext(dashboardId: string) {
  const { range, startDate, endDate, interval } = useOverviewOptions();
  usePageContext({
    page: 'dashboard',
    dashboardId,
    range,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    interval: interval ?? undefined,
  });
}

export function useReportEditorContext(reportId: string | null | undefined) {
  usePageContext({ page: 'report', reportId: reportId ?? undefined });
}
