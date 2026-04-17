import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import {
  type PageContext,
  type PageContextPage,
  usePageContext,
} from '@/contexts/page-context';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from './use-event-query-filters';
import { useAppParams } from './use-app-params';
import type { IReportInput } from '@openpanel/validation';

/**
 * For pages that share the standard date-range / interval filters
 * (Overview, Insights, Pages, SEO, Events, etc.). Reads the current
 * range + interval from `useOverviewOptions` and registers the page
 * context.
 */
export function useRangePageContext(page: PageContextPage) {
  const { projectId, organizationId } = useAppParams();
  const { range, startDate, endDate, interval } = useOverviewOptions();
  const [eventNames] = useEventQueryNamesFilter();
  const [eventFilters] = useEventQueryFilters();

  usePageContext({
    page,
    route: { projectId, organizationId },
    filters: {
      range,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
      interval: interval ?? undefined,
      // Send the active event-name + property filters so the chat
      // assistant can reason about the current view (e.g. "you're
      // already filtering to mobile") and produce diff-style
      // updates via the apply_filters tool.
      ...(eventNames.length > 0 ? { eventNames } : {}),
      ...(eventFilters.length > 0 ? { eventFilters } : {}),
    },
  });
}

/**
 * For entity-detail pages (session detail, profile detail, group detail).
 * Takes the primary IDs + an optional primer object (small structured
 * snapshot of what's visible — country, device, duration, etc.) so the
 * model can answer trivial follow-ups without a tool call.
 */
export function useEntityPageContext(
  page: 'sessionDetail' | 'profileDetail' | 'groupDetail',
  ids: PageContext['ids'],
  primer?: Record<string, unknown>,
) {
  const { projectId, organizationId } = useAppParams();

  usePageContext({
    page,
    route: { projectId, organizationId },
    ids,
    primer,
  });
}

/**
 * For the Dashboard detail page. Sends the dashboardId + the active
 * range/interval picker (so `summarize_dashboard` runs each report
 * against whatever window the user is currently viewing) plus an
 * optional primer with the dashboard name + report list, so the model
 * can answer "what's on this dashboard?" without an extra tool call.
 */
export function useDashboardPageContext(
  dashboardId: string,
  primer?: Record<string, unknown>,
) {
  const { projectId, organizationId } = useAppParams();
  const { range, startDate, endDate, interval } = useOverviewOptions();

  usePageContext({
    page: 'dashboard',
    route: { projectId, organizationId },
    ids: { dashboardId },
    filters: {
      range,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
      interval: interval ?? undefined,
    },
    ...(primer ? { primer } : {}),
  });
}

/**
 * For the Report Editor page. Sends the full live report draft so the
 * model can propose concrete edits via `preview_report_with_changes`.
 */
export function useReportEditorContext(reportDraft: IReportInput | null) {
  const { projectId, organizationId } = useAppParams();

  // The draft can be null while the report loads — the cleanup handler
  // in usePageContext clears it on unmount, so passing null on every
  // render before the data arrives is safe (we just register a context
  // without a draft until the first render with a real draft).
  usePageContext({
    page: 'reportEditor',
    route: { projectId, organizationId },
    ...(reportDraft ? { reportDraft } : {}),
  });
}
