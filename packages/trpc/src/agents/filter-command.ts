import {
  type AgentToolDefinition,
  betterAgent,
  defineAgent,
  defineTool,
  type ToolRunContext,
} from '@better-agent/core';
import { intervals, operators, timeWindows } from '@openpanel/constants';
import {
  getDatesFromRange,
  getTopPagesCore,
  getTrafficBreakdownCore,
  listEventNamesCore,
  resolveDateRange as resolveDateRangeCore,
} from '@openpanel/db';
import {
  CHAT_MODELS,
  type ChatModelEntry,
  type IChartEventFilter,
  type IChartRange,
  objectToZodEnums,
  type PageContext,
  zRange,
} from '@openpanel/validation';
import { z } from 'zod';
import { resolveModel } from './models';

const operatorEnum = z.enum(objectToZodEnums(operators));
const rangeEnum = zRange;
const intervalEnum = z.enum(objectToZodEnums(intervals));

export const filterCommandOutputSchema = z.object({
  applyFilters: z
    .object({
      range: rangeEnum.nullable(),
      startDate: z.string().nullable().describe('YYYY-MM-DD or null'),
      endDate: z.string().nullable().describe('YYYY-MM-DD or null'),
      interval: intervalEnum.nullable(),
    })
    .nullable()
    .describe(
      'Date range / interval. Null = no change. Either set `range` to a preset (and null both dates) OR set `startDate`+`endDate` for a custom window (and null `range`) — never both.',
    ),
  setPropertyFilters: z
    .object({
      filters: z.array(
        z.object({
          name: z
            .string()
            .describe(
              'Property key. Common: country, region, city, device, browser, os, referrer_name, referrer_type, path, origin, utm_source, utm_medium, utm_campaign.',
            ),
          operator: operatorEnum,
          value: z
            .array(z.string())
            .describe(
              "Values to match (OR'd). Use [] for isNull / isNotNull.",
            ),
        }),
      ),
    })
    .nullable()
    .describe(
      'REPLACES the active property-filter set. Null = no change. To ADD to existing filters, include the current ones (see "Current view"). Empty filters array clears all property filters.',
    ),
  setEventNamesFilter: z
    .object({ eventNames: z.array(z.string()) })
    .nullable()
    .describe(
      'REPLACES the event-name filter. Null = no change. Empty array shows all events. Verify names with list_event_names if unsure.',
    ),
  summary: z
    .string()
    .describe(
      'One-line confirmation in 8-15 words. No preamble, no markdown. If ambiguous and you applied no changes, explain what you need.',
    ),
});

export type FilterCommandResult = z.infer<typeof filterCommandOutputSchema>;

const filterCommandContextSchema = z.object({
  projectId: z.string(),
  timezone: z.string(),
  pageContext: z
    .object({
      filters: z
        .object({
          range: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          interval: z.string().optional(),
          eventNames: z.array(z.string()).optional(),
          eventFilters: z.array(z.record(z.string(), z.unknown())).optional(),
        })
        .optional(),
    })
    .optional(),
});

type FilterCommandContext = z.infer<typeof filterCommandContextSchema>;

const PREFERRED_MODEL_IDS = ['claude-haiku-4-5', 'gpt-4-1-mini'] as const;

function pickModel(): ChatModelEntry {
  const haveOpenai = Boolean(process.env.OPENAI_API_KEY);
  const haveAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const available = (entry: ChatModelEntry) =>
    (entry.group === 'OpenAI' && haveOpenai) ||
    (entry.group === 'Anthropic' && haveAnthropic);

  for (const id of PREFERRED_MODEL_IDS) {
    const entry = CHAT_MODELS.find((m) => m.id === id);
    if (entry && available(entry)) return entry;
  }
  const fallback = CHAT_MODELS.find(available);
  if (!fallback) {
    throw new Error(
      'filter-command: no model available — set OPENAI_API_KEY or ANTHROPIC_API_KEY.',
    );
  }
  return fallback;
}

const PRESET_RANGES: ReadonlySet<IChartRange> = new Set(
  (Object.keys(timeWindows) as IChartRange[]).filter((k) => k !== 'custom'),
);

function resolveRange(
  filters: FilterCommandContext['pageContext'] extends infer T
    ? T extends { filters?: infer F }
      ? F
      : undefined
    : undefined,
  timezone: string,
): { startDate: string; endDate: string } {
  if (filters?.startDate || filters?.endDate) {
    return resolveDateRangeCore(filters.startDate, filters.endDate);
  }
  const range = filters?.range as IChartRange | undefined;
  if (range && PRESET_RANGES.has(range)) {
    return getDatesFromRange(range, timezone);
  }
  return resolveDateRangeCore(undefined, undefined);
}

function activeFilters(ctx: FilterCommandContext): IChartEventFilter[] {
  const raw = ctx.pageContext?.filters?.eventFilters;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is IChartEventFilter =>
      typeof (f as { name?: unknown })?.name === 'string',
  );
}

function defineServerTool<TSchema extends z.ZodTypeAny>(config: {
  name: string;
  description: string;
  schema: TSchema;
  handler: (
    input: z.infer<TSchema>,
    ctx: FilterCommandContext,
  ) => Promise<unknown>;
}): AgentToolDefinition {
  // biome-ignore lint/suspicious/noExplicitAny: Zod schema instantiation depth — same dodge as apps/api/src/agents/tools/ui.ts
  const contract: any = defineTool({
    name: config.name,
    description: config.description,
    schema: config.schema,
  });
  return contract.server(async (input: unknown, runCtx: ToolRunContext) =>
    config.handler(
      input as z.infer<TSchema>,
      runCtx.context as FilterCommandContext,
    ),
  ) as AgentToolDefinition;
}

const listEventNamesTool = defineServerTool({
  name: 'list_event_names',
  description:
    'Top 50 event names tracked in this project. Use BEFORE setting `setEventNamesFilter`.',
  schema: z.object({}),
  handler: async (_input, ctx) => ({
    event_names: await listEventNamesCore(ctx.projectId),
  }),
});

const getTopReferrersTool = defineServerTool({
  name: 'get_top_referrers',
  description:
    "Top traffic sources by `referrer_name` ('Google', 'GitHub', 'Direct') in the user's current date range. Use to translate vague names into exact filter values.",
  schema: z.object({}),
  handler: async (_input, ctx) => {
    const range = resolveRange(ctx.pageContext?.filters, ctx.timezone);
    const rows = await getTrafficBreakdownCore({
      projectId: ctx.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      column: 'referrer_name',
      filters: activeFilters(ctx),
    });
    return { rows: rows.slice(0, 30) };
  },
});

const getTopCountriesTool = defineServerTool({
  name: 'get_top_countries',
  description: "Top countries (ISO-2 codes) in the user's current date range.",
  schema: z.object({}),
  handler: async (_input, ctx) => {
    const range = resolveRange(ctx.pageContext?.filters, ctx.timezone);
    const rows = await getTrafficBreakdownCore({
      projectId: ctx.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      column: 'country',
      filters: activeFilters(ctx),
    });
    return { rows: rows.slice(0, 50) };
  },
});

const getTopDevicesTool = defineServerTool({
  name: 'get_top_devices',
  description:
    "Device classes seen in the user's current date range (mobile, desktop, tablet, …).",
  schema: z.object({}),
  handler: async (_input, ctx) => {
    const range = resolveRange(ctx.pageContext?.filters, ctx.timezone);
    const rows = await getTrafficBreakdownCore({
      projectId: ctx.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      column: 'device',
      filters: activeFilters(ctx),
    });
    return { rows: rows.slice(0, 20) };
  },
});

const getTopPagesTool = defineServerTool({
  name: 'get_top_pages',
  description:
    "Top pages (paths like '/blog/foo', '/pricing', '/') in the user's current date range. Use to discover the path shape so you can pick the right operator (`startsWith` for sections like /blog, `is` for an exact page, `contains` for fuzzy matching).",
  schema: z.object({}),
  handler: async (_input, ctx) => {
    const range = resolveRange(ctx.pageContext?.filters, ctx.timezone);
    const rows = await getTopPagesCore({
      projectId: ctx.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      filters: activeFilters(ctx),
      limit: 50,
    });
    return { rows };
  },
});

const FILTER_COMMAND_TOOLS: AgentToolDefinition[] = [
  listEventNamesTool,
  getTopReferrersTool,
  getTopCountriesTool,
  getTopDevicesTool,
  getTopPagesTool,
];

function buildInstruction(ctx: FilterCommandContext): string {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const dayName = today.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });

  return [
    "You are the OpenPanel filter command bar. Convert the user's short request into a structured filter update, then output a single short confirmation sentence in `summary`.",
    '',
    `Today is **${dayName}, ${todayIso}** (UTC). Use it for relative date math.`,
    '',
    '# Rules',
    '- For date ranges, prefer presets when they match exactly. Anything that does not map to a preset MUST go through `startDate`+`endDate` (YYYY-MM-DD).',
    '- "last week", explicit calendar windows ("Q1 2026", "august last year", "May 24-28") → ALWAYS compute `startDate`+`endDate` manually relative to today.',
    '- For property filters: REPLACE semantics. To ADD to the existing set, include the current filters (listed under "Current view") in your output.',
    '- When the user names a source ("google", "twitter", "hackernews") that may not be an exact known referrer, call `get_top_referrers` first and pick the matching `referrer_name` value(s). Same for countries (`get_top_countries`) and devices (`get_top_devices`).',
    '- Prefer `referrer_name` for source filtering (e.g. "Google", "GitHub"), not the raw URL.',
    '',
    '# Page / path filtering',
    '- When the user asks about a page or section ("blog posts", "the pricing page", "anything under /docs", "homepage only"), filter on the `path` property.',
    '- Pick the operator that matches intent:',
    '  - "blog posts" / "anything under /blog" / "the docs section" → `startsWith` with value like `["/blog"]` or `["/docs"]`',
    '  - "pages with `pricing` in the URL" / fuzzy match → `contains`',
    '  - exact page ("the homepage", "the pricing page") → `is` with the exact path (`["/"]` or `["/pricing"]`)',
    '  - "anything ending in .pdf" → `endsWith`',
    '- If you are not sure what paths exist (e.g. user says "blog" but the project might use `/posts/*` instead), call `get_top_pages` FIRST to see real paths, then pick the right prefix.',
    '- Never invent event names — call `list_event_names` if unsure.',
    '- Set `applyFilters` / `setPropertyFilters` / `setEventNamesFilter` to `null` when the user did not ask to change them. Do not over-apply.',
    '- If the request is ambiguous, leave all three groups null and put a clarification in `summary`.',
    '',
    buildPageContextSection(ctx),
  ].join('\n');
}

function buildPageContextSection(ctx: FilterCommandContext): string {
  const pc = ctx.pageContext;
  const lines: string[] = ['# Current view'];

  if (!pc?.filters) {
    lines.push('No filters currently active.');
    return lines.join('\n');
  }

  if (pc.filters.range) {
    const resolved = resolveRange(pc.filters, ctx.timezone);
    const interval = pc.filters.interval ?? 'day';
    lines.push(
      `Date range: ${pc.filters.range} (${resolved.startDate} to ${resolved.endDate}), interval: ${interval}.`,
    );
  } else {
    lines.push('Date range: default (no `range` set).');
  }

  if (pc.filters.eventNames && pc.filters.eventNames.length > 0) {
    lines.push(
      `Active event-name filter: ${JSON.stringify(pc.filters.eventNames)}`,
    );
  } else {
    lines.push('No event-name filter active.');
  }

  if (pc.filters.eventFilters && pc.filters.eventFilters.length > 0) {
    lines.push(
      `Active property filters: ${JSON.stringify(pc.filters.eventFilters)}`,
    );
  } else {
    lines.push('No property filters active.');
  }

  return lines.join('\n');
}

const filterCommandOutputJsonSchema = z.toJSONSchema(
  filterCommandOutputSchema,
  { target: 'draft-07' },
);

let _app: ReturnType<typeof betterAgent> | null = null;
function getApp() {
  if (_app) return _app;
  const agent = defineAgent({
    name: 'filter-command',
    description: 'OpenPanel filter command bar (one-shot, no persistence).',
    model: resolveModel(pickModel()),
    contextSchema: filterCommandContextSchema,
    outputSchema: {
      schema: filterCommandOutputJsonSchema,
      name: 'filter_command_output',
      strict: true,
    },
    instruction: (ctx: FilterCommandContext) => buildInstruction(ctx),
    tools: () => FILTER_COMMAND_TOOLS,
    maxSteps: 6,
    // biome-ignore lint/suspicious/noExplicitAny: same dodge as apps/api/src/agents/app.ts
  } as any);
  _app = betterAgent({ agents: [agent] });
  return _app;
}

export async function runFilterCommand(input: {
  query: string;
  projectId: string;
  pageContext?: PageContext;
  timezone: string;
}): Promise<FilterCommandResult> {
  const result = (await getApp().run('filter-command', {
    input: input.query,
    context: {
      projectId: input.projectId,
      timezone: input.timezone,
      pageContext: input.pageContext as FilterCommandContext['pageContext'],
    },
    // biome-ignore lint/suspicious/noExplicitAny: same dodge as apps/api/src/agents/app.ts
  } as any)) as { structured?: FilterCommandResult };

  if (!result.structured) {
    throw new Error('filter-command agent returned no structured output');
  }
  return result.structured;
}
