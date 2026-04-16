import { type AgentToolDefinition, defineTool } from '@better-agent/core';
import {
  applyFiltersSchema,
  setEventNamesFilterSchema,
  setPropertyFiltersSchema,
} from '@openpanel/validation';

/**
 * Client-side UI-mutator tools.
 *
 * Better Agent emits each call as a `tool-call` part with no server
 * execution; the frontend (`useAgent({ toolHandlers })`) handles them
 * by updating the URL params the dashboard's hooks read. Zod schemas
 * are imported from `@openpanel/validation` so the frontend handler
 * types stay in sync with what the LLM calls.
 */

// Cast to `any` before `.client()` for the same reason `chatTool`
// does in `helpers.ts`: TS otherwise fully instantiates
// `ClientToolDefinition<TSchema, ...>` for the deeply-nested Zod
// schema and trips its instantiation depth limit. The runtime is
// fine; the AgentToolDefinition cast on the way out restores a
// usable type for downstream code.
// biome-ignore lint/suspicious/noExplicitAny: see comment above
const applyFiltersContract: any = defineTool({
  name: 'apply_filters',
  description:
    "Apply filters to the user's current dashboard page. Use this whenever the user asks to change the date range, interval, or otherwise filter the view (e.g. 'filter to 24-28 May', 'show last 7 days', 'switch to weekly intervals'). Pair with prose like 'Done — showing 24-28 May.' Only one of `range` (a preset) OR `startDate`+`endDate` (a custom range) should be set, not both.",
  schema: applyFiltersSchema,
});

export const applyFilters: AgentToolDefinition =
  applyFiltersContract.client() as AgentToolDefinition;

// biome-ignore lint/suspicious/noExplicitAny: see comment on applyFiltersContract
const setPropertyFiltersContract: any = defineTool({
  name: 'set_property_filters',
  description:
    "Replace the active event-property filter set on the user's current dashboard page (overview, pages, seo, events, insights, profile detail). Use for requests like 'show me referrers from GitHub', 'mobile only', 'filter to Sweden + Germany', or 'add Bing as a referrer' — for the add case, pass the new full list including what's already active (the current filters are in pageContext.filters.eventFilters). Pass an empty array to clear all property filters.",
  schema: setPropertyFiltersSchema,
});

export const setPropertyFilters: AgentToolDefinition =
  setPropertyFiltersContract.client() as AgentToolDefinition;

// biome-ignore lint/suspicious/noExplicitAny: see comment on applyFiltersContract
const setEventNamesFilterContract: any = defineTool({
  name: 'set_event_names_filter',
  description:
    "Restrict the page to specific event names (e.g. 'show me only signups', 'just screen_view + click events'). Pass the FULL list of event names — replaces the current set. Pass an empty array to clear (show all events). Verify event names with list_event_names when unsure.",
  schema: setEventNamesFilterSchema,
});

export const setEventNamesFilter: AgentToolDefinition =
  setEventNamesFilterContract.client() as AgentToolDefinition;
