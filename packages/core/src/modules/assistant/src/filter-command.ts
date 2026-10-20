// The overview command bar: one natural-language request becomes one
// structured filter change, checked against real referrer, country, device
// and page values before it is applied.
import { resolveDateRange as resolveDateRangeCore } from '@openpanel/shared';
import { generateText, isStepCount, Output, tool } from 'ai';
import { z } from 'zod';
import type { ServiceDeps } from '../../../services';
import { listEventNamesCore } from '../../event/event.service';
import { getTrafficBreakdownCore } from '../../overview/overview.service';
import { getTopPagesCore } from '../../overview/pages.service';
import {
  type IChartEventFilter,
  type IChartRange,
  intervals,
  operators,
  timeWindows,
  zRange,
} from '../../report/report.constants';
import { getDatesFromRange } from '../../report/src/chart-dates';
import { resolveUtilityModel } from './providers';

function enumKeys<K extends string>(record: Record<K, unknown>): [K, ...K[]] {
  const [first, ...rest] = Object.keys(record) as K[];
  return [first as K, ...rest];
}

const MAX_STEPS = 4;
const REFERRER_LIMIT = 30;
const COUNTRY_LIMIT = 50;
const DEVICE_LIMIT = 20;
const PAGE_LIMIT = 50;
const DATE_LENGTH = 10;

const filterCommandOutputSchema = z.object({
  applyFilters: z
    .object({
      range: zRange.nullable(),
      startDate: z.string().nullable().describe('YYYY-MM-DD or null'),
      endDate: z.string().nullable().describe('YYYY-MM-DD or null'),
      interval: z.enum(enumKeys(intervals)).nullable(),
    })
    .nullable()
    .describe(
      'Date range and interval. Null = no change. Either set `range` to a preset (and null both dates) or set `startDate`+`endDate` (and null `range`), never both.'
    ),
  setPropertyFilters: z
    .object({
      filters: z.array(
        z.object({
          name: z
            .string()
            .describe(
              'Property key. Common: country, region, city, device, browser, os, referrer_name, referrer_type, path, origin, utm_source, utm_medium, utm_campaign.'
            ),
          operator: z.enum(enumKeys(operators)),
          value: z
            .array(z.string())
            .describe("Values to match (OR'd). [] for isNull / isNotNull."),
        })
      ),
    })
    .nullable()
    .describe(
      'REPLACES the active property filters. Null = no change. To add to the existing set, include the current filters. An empty array clears them.'
    ),
  setEventNamesFilter: z
    .object({ eventNames: z.array(z.string()) })
    .nullable()
    .describe(
      'REPLACES the event-name filter. Null = no change. [] shows all events.'
    ),
  summary: z
    .string()
    .describe(
      'One-line confirmation in 8 to 15 words. No preamble, no markdown. If nothing was applied, say what is missing.'
    ),
});

export type FilterCommandResult = z.infer<typeof filterCommandOutputSchema>;

export interface FilterCommandInput {
  query: string;
  projectId: string;
  timezone: string;
  pageContext?: {
    filters?: {
      range?: string;
      startDate?: string;
      endDate?: string;
      interval?: string;
      eventNames?: string[];
      eventFilters?: Record<string, unknown>[];
    };
  };
}

const PRESET_RANGES: ReadonlySet<string> = new Set(
  Object.keys(timeWindows).filter((key) => key !== 'custom')
);

function resolveRange(input: FilterCommandInput): {
  startDate: string;
  endDate: string;
} {
  const filters = input.pageContext?.filters;
  if (filters?.startDate || filters?.endDate) {
    return resolveDateRangeCore(filters.startDate, filters.endDate);
  }
  if (filters?.range && PRESET_RANGES.has(filters.range)) {
    return getDatesFromRange(filters.range as IChartRange, input.timezone);
  }
  return resolveDateRangeCore(undefined, undefined);
}

function activeFilters(input: FilterCommandInput): IChartEventFilter[] {
  const raw = input.pageContext?.filters?.eventFilters;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (filter): filter is IChartEventFilter => typeof filter.name === 'string'
  );
}

function lookupTools(deps: ServiceDeps, input: FilterCommandInput) {
  const range = resolveRange(input);
  const filters = activeFilters(input);
  const breakdown = (
    column: 'referrer_name' | 'country' | 'device',
    limit: number
  ) =>
    getTrafficBreakdownCore(deps, {
      projectId: input.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      column,
      filters,
    }).then((rows) => ({ rows: rows.slice(0, limit) }));

  return {
    list_event_names: tool({
      description:
        'Event names tracked in this project. Use before setting an event-name filter.',
      inputSchema: z.object({}),
      execute: async () => ({
        events: await listEventNamesCore(deps, input.projectId),
      }),
    }),
    get_top_referrers: tool({
      description:
        "Referrer names seen in the current range ('Google', 'GitHub', 'Direct'). Use to turn a vague source into exact `referrer_name` values.",
      inputSchema: z.object({}),
      execute: () => breakdown('referrer_name', REFERRER_LIMIT),
    }),
    get_top_countries: tool({
      description: 'Country codes (ISO-2) seen in the current range.',
      inputSchema: z.object({}),
      execute: () => breakdown('country', COUNTRY_LIMIT),
    }),
    get_top_devices: tool({
      description:
        'Device classes seen in the current range (mobile, desktop, tablet).',
      inputSchema: z.object({}),
      execute: () => breakdown('device', DEVICE_LIMIT),
    }),
    get_top_pages: tool({
      description:
        'Paths seen in the current range. Use to pick the right operator: startsWith for a section, is for one page, contains for fuzzy.',
      inputSchema: z.object({}),
      execute: async () => ({
        rows: await getTopPagesCore(deps, {
          projectId: input.projectId,
          startDate: range.startDate,
          endDate: range.endDate,
          filters,
          limit: PAGE_LIMIT,
        }),
      }),
    }),
  };
}

function currentView(input: FilterCommandInput): string {
  const filters = input.pageContext?.filters;
  const lines = ['# Current view'];
  if (filters?.range) {
    const range = resolveRange(input);
    lines.push(
      `Date range: ${filters.range} (${range.startDate} to ${range.endDate}), interval: ${filters.interval ?? 'day'}.`
    );
  } else {
    lines.push('Date range: default.');
  }
  lines.push(
    filters?.eventNames?.length
      ? `Active event-name filter: ${JSON.stringify(filters.eventNames)}`
      : 'No event-name filter active.'
  );
  lines.push(
    filters?.eventFilters?.length
      ? `Active property filters: ${JSON.stringify(filters.eventFilters)}`
      : 'No property filters active.'
  );
  return lines.join('\n');
}

function instructions(input: FilterCommandInput): string {
  const now = new Date();
  const today = now.toISOString().slice(0, DATE_LENGTH);
  const weekday = now.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return [
    "You are the OpenPanel filter command bar. Convert the user's short request into a structured filter update and one short confirmation sentence.",
    '',
    `Today is ${weekday}, ${today} (UTC).`,
    '',
    '# Rules',
    '- Prefer a preset range when it matches exactly. Anything else ("last week", "Q1 2026", "august last year", "May 24-28") goes through startDate and endDate.',
    '- Property filters replace the active set: to add, include the current filters from "Current view".',
    '- When the user names a source, country or device, call the matching lookup tool and use the exact values it returns. Filter sources on `referrer_name`.',
    '- Page requests filter on `path`: startsWith for a section (/blog), is for one page (/pricing), contains for fuzzy, endsWith for a suffix. Call get_top_pages when unsure what paths exist.',
    '- Never invent event names; call list_event_names if unsure.',
    '- Leave a group null when the user did not ask to change it. If the request is ambiguous, leave all three null and ask in `summary`.',
    '',
    currentView(input),
  ].join('\n');
}

export async function runFilterCommand(
  deps: ServiceDeps,
  input: FilterCommandInput
): Promise<FilterCommandResult> {
  const model = resolveUtilityModel(deps.config);
  if (!model) {
    throw new Error(
      'No AI provider is configured: set OPENAI_API_KEY or ANTHROPIC_API_KEY.'
    );
  }
  const result = await generateText({
    model,
    instructions: instructions(input),
    prompt: input.query,
    tools: lookupTools(deps, input),
    stopWhen: isStepCount(MAX_STEPS),
    reasoning: 'low',
    output: Output.object({ schema: filterCommandOutputSchema }),
  });
  if (!result.output) {
    return {
      applyFilters: null,
      setPropertyFilters: null,
      setEventNamesFilter: null,
      summary: "Couldn't turn that into a filter. Try rephrasing.",
    };
  }
  return result.output;
}
