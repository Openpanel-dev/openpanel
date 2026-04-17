import { z } from 'zod';

/**
 * Shared chat/agent schemas and the model whitelist.
 *
 * Lives in `@openpanel/validation` so both `apps/api` (which builds
 * the Better Agent app) and `apps/start` (which types the client and
 * the model picker) import from the same module instead of reaching
 * across the app boundary with relative paths.
 *
 * The full `ChatApp` type (Better Agent's inferred app type) still
 * lives in `apps/api/src/agents/app.ts` — it's `typeof chatApp` and
 * inherently bound to the server-side agent definition. The frontend
 * types its client against it via a narrow type-only import; schemas
 * + the model whitelist are what actually duplicated before this
 * move, and they now come from here.
 */

// ────────────────────────────────────────────────────────────────────
// Page context — "what the user is looking at right now"
// ────────────────────────────────────────────────────────────────────

export const pageContextPageSchema = z.enum([
  'overview',
  'insights',
  'pages',
  'seo',
  'sessionDetail',
  'profileDetail',
  'reportEditor',
  'events',
  'groupDetail',
  'dashboard',
]);

export const pageContextSchema = z.object({
  page: pageContextPageSchema,
  route: z.object({
    projectId: z.string(),
    organizationId: z.string(),
  }),
  ids: z
    .object({
      sessionId: z.string().optional(),
      profileId: z.string().optional(),
      reportId: z.string().optional(),
      groupId: z.string().optional(),
      dashboardId: z.string().optional(),
    })
    .optional(),
  filters: z
    .object({
      range: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      interval: z.string().optional(),
      eventNames: z.array(z.string()).optional(),
      eventFilters: z.array(z.record(z.string(), z.unknown())).optional(),
      search: z.string().optional(),
    })
    .optional(),
  reportDraft: z.record(z.string(), z.unknown()).optional(),
  primer: z.record(z.string(), z.unknown()).optional(),
});

export type PageContext = z.infer<typeof pageContextSchema>;
export type PageContextPage = z.infer<typeof pageContextPageSchema>;

/**
 * Agent context shared by every agent. The client sends all three fields,
 * but the auth plugin guard validates that the session user actually has
 * access to (projectId, organizationId) and rejects mismatches before
 * the agent ever runs. Tools may safely trust these values.
 */
export const chatContextSchema = z.object({
  projectId: z.string(),
  organizationId: z.string(),
  pageContext: pageContextSchema.optional(),
});

export type ChatAgentContext = z.infer<typeof chatContextSchema>;

// ────────────────────────────────────────────────────────────────────
// Model whitelist — single source of truth, consumed by:
//   - apps/api (builds an agent per entry)
//   - apps/start (model picker)
// Adding a new model = add an entry here. No other changes required.
// ────────────────────────────────────────────────────────────────────

export type ChatProvider = 'OpenAI' | 'Anthropic';

export type ChatModelEntry = {
  /** URL-safe agent name (no colons, slashes, or percent-encoding needed). */
  id: string;
  /** Native model id passed to the provider client. */
  modelId: string;
  label: string;
  group: ChatProvider;
  /**
   * When true, the agent is configured with the provider's `reasoning`
   * options so the model returns reasoning tokens as streamed text
   * events. Only set this on reasoning-capable models (o-series,
   * gpt-5 / gpt-5.x, etc.). Non-reasoning models reject the option.
   */
  reasoning?: boolean;
};

export const CHAT_MODELS = [
  { id: 'gpt-4-1', modelId: 'gpt-4.1', label: 'GPT-4.1', group: 'OpenAI' },
  {
    id: 'gpt-4-1-mini',
    modelId: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    group: 'OpenAI',
  },
  {
    id: 'gpt-5.4-mini',
    modelId: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    group: 'OpenAI',
    reasoning: true,
  },
  {
    id: 'claude-haiku-4-5',
    modelId: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    group: 'Anthropic',
  },
  {
    id: 'claude-sonnet-4-6',
    modelId: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    group: 'Anthropic',
  },
  {
    id: 'claude-opus-4-6',
    modelId: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    group: 'Anthropic',
  },
] as const satisfies readonly ChatModelEntry[];

export type ChatModelId = (typeof CHAT_MODELS)[number]['id'];

export const MODEL_STORAGE_KEY = 'op-chat-model';

export function isValidModelId(id: string | null | undefined): id is ChatModelId {
  return !!id && CHAT_MODELS.some((m) => m.id === id);
}

export function getModelLabel(id: string): string {
  return CHAT_MODELS.find((m) => m.id === id)?.label ?? id;
}

/**
 * Filter the whitelist to models whose provider has an API key configured.
 * Returned in the same order as `CHAT_MODELS` (OpenAI first, then Anthropic)
 * so the first entry is a stable default.
 */
export function getAvailableChatModels(providers: {
  openai: boolean;
  anthropic: boolean;
}): ChatModelEntry[] {
  return CHAT_MODELS.filter((m) => {
    if (m.group === 'OpenAI') return providers.openai;
    if (m.group === 'Anthropic') return providers.anthropic;
    return false;
  });
}

// ────────────────────────────────────────────────────────────────────
// Client-side tool schemas — the three URL-param mutators the LLM can
// call on the page. Defined here because both the server (wraps them
// with `defineTool().client()`) and the client (types handler inputs)
// need the same Zod schema.
// ────────────────────────────────────────────────────────────────────

export const applyFiltersSchema = z.object({
  range: z
    .enum([
      '30min',
      'lastHour',
      'today',
      'yesterday',
      '7d',
      '30d',
      '6m',
      '12m',
      'monthToDate',
      'lastMonth',
      'yearToDate',
      'lastYear',
      'custom',
    ])
    .optional()
    .describe(
      'Preset date range. Use ONE of these exact values; anything else (e.g. "last week", "14d", "Q1 2026") MUST go through startDate + endDate as a custom range.',
    ),
  startDate: z
    .string()
    .optional()
    .describe(
      'ISO date YYYY-MM-DD. Pair with endDate for custom ranges. Switches range to custom automatically.',
    ),
  endDate: z
    .string()
    .optional()
    .describe('ISO date YYYY-MM-DD. Pair with startDate.'),
  interval: z
    .enum(['minute', 'hour', 'day', 'week', 'month'])
    .optional()
    .describe(
      'Override the chart interval (otherwise auto-picked from the range).',
    ),
});

export type ApplyFiltersInput = z.infer<typeof applyFiltersSchema>;

export const setPropertyFiltersSchema = z.object({
  filters: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            [
              'Property key. Common values:',
              '- Geo: country, region, city',
              '- Device: device, browser, os',
              '- Referrer: PREFER `referrer_name` for filtering by source name (e.g. "GitHub", "Hacker News", "Direct"). Use `referrer_type` only for traffic class (search, social, direct, etc.) and the raw `referrer` URL only when the user asks for an exact URL match.',
              '- Page: path, origin',
              '- UTM: utm_source, utm_medium, utm_campaign, utm_term, utm_content',
              'Verify with list_event_properties when unsure.',
            ].join('\n'),
          ),
        operator: z
          .enum([
            'is',
            'isNot',
            'contains',
            'doesNotContain',
            'startsWith',
            'endsWith',
            'regex',
            'isNull',
            'isNotNull',
            'gt',
            'lt',
            'gte',
            'lte',
          ])
          .default('is'),
        value: z
          .array(z.string())
          .describe(
            'Values to match. Multiple values are OR\'d together within the same filter (e.g. ["SE", "US"] = country is SE or US). Use [] when operator is isNull / isNotNull.',
          ),
      }),
    )
    .describe(
      'The full new filter set. REPLACES the current filters — to add to the existing set, include the current ones too.',
    ),
});

export type SetPropertyFiltersInput = z.infer<typeof setPropertyFiltersSchema>;

export const setEventNamesFilterSchema = z.object({
  eventNames: z
    .array(z.string())
    .describe('Full list of event names to restrict to. Empty = show all.'),
});

export type SetEventNamesFilterInput = z.infer<typeof setEventNamesFilterSchema>;

/**
 * Handler-map type for the client-side UI-mutator tools.
 *
 * Better Agent's `toolHandlers` expects each value to be
 * `(input: unknown, ctx?: ...) => unknown`, so the input is typed as
 * `unknown` here — the concrete handlers narrow with a cast using the
 * matching `*Input` type exported above. The point of this type is
 * the *key set*: adding a new `.client()` tool on the server surfaces
 * an unused-property error here, forcing us to register a handler
 * rather than silently returning undefined. It avoids the frontend
 * needing to cross the app boundary for its handler typing.
 */
export type ChatClientToolHandlers = {
  apply_filters: (input: unknown) => unknown | Promise<unknown>;
  set_property_filters: (input: unknown) => unknown | Promise<unknown>;
  set_event_names_filter: (input: unknown) => unknown | Promise<unknown>;
};
