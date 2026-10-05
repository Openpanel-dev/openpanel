import { z } from 'zod';

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
 * Agent context shared by every agent. `assistant.routes.ts` checks the session
 * user's access to (projectId, organizationId) before a run; that is the
 * module's only tenancy gate, so tools trust `context.projectId`.
 */
export const chatContextSchema = z.object({
  projectId: z.string(),
  organizationId: z.string(),
  pageContext: pageContextSchema.optional(),
});

export type ChatAgentContext = z.infer<typeof chatContextSchema>;

export type ChatProvider = 'OpenAI' | 'Anthropic';

export type ChatModelEntry = {
  /** URL-safe agent name (no colons, slashes, or percent-encoding needed). */
  id: string;
  /** Native model id passed to the provider client. */
  modelId: string;
  label: string;
  group: ChatProvider;
  /** Only for reasoning-capable models; others reject the `reasoning` option. */
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

/**
 * localStorage key for the preferred chat model id. Bump the suffix when the
 * default changes: it invalidates models users had pinned (gpt-4-1 hit Tier 1
 * rate limits almost immediately).
 */
export const MODEL_STORAGE_KEY = 'op-chat-model-v2';

/**
 * Preferred default model id when its provider is configured. gpt-4.1-mini has
 * a far higher per-minute token budget than gpt-4.1 on OpenAI Tier 1 (200k vs 30k TPM).
 */
export const PREFERRED_DEFAULT_MODEL_ID = 'gpt-4-1-mini';

export function isValidModelId(
  id: string | null | undefined
): id is ChatModelId {
  return !!id && CHAT_MODELS.some((m) => m.id === id);
}

export function getModelLabel(id: string): string {
  return CHAT_MODELS.find((m) => m.id === id)?.label ?? id;
}

/** Models whose provider has an API key configured, in `CHAT_MODELS` order so the first entry is a stable default. */
export function getAvailableChatModels(providers: {
  openai: boolean;
  anthropic: boolean;
}): ChatModelEntry[] {
  return CHAT_MODELS.filter((m) => {
    if (m.group === 'OpenAI') {
      return providers.openai;
    }
    if (m.group === 'Anthropic') {
      return providers.anthropic;
    }
    return false;
  });
}

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
      'Preset date range. Use ONE of these exact values; anything else (e.g. "last week", "14d", "Q1 2026") MUST go through startDate + endDate as a custom range.'
    ),
  startDate: z
    .string()
    .optional()
    .describe(
      'ISO date YYYY-MM-DD. Pair with endDate for custom ranges. Switches range to custom automatically.'
    ),
  endDate: z
    .string()
    .optional()
    .describe('ISO date YYYY-MM-DD. Pair with startDate.'),
  interval: z
    .enum(['minute', 'hour', 'day', 'week', 'month'])
    .optional()
    .describe(
      'Override the chart interval (otherwise auto-picked from the range).'
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
            ].join('\n')
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
            'Values to match. Multiple values are OR\'d together within the same filter (e.g. ["SE", "US"] = country is SE or US). Use [] when operator is isNull / isNotNull.'
          ),
      })
    )
    .describe(
      'The full new filter set. REPLACES the current filters — to add to the existing set, include the current ones too.'
    ),
});

export type SetPropertyFiltersInput = z.infer<typeof setPropertyFiltersSchema>;

export const setEventNamesFilterSchema = z.object({
  eventNames: z
    .array(z.string())
    .describe('Full list of event names to restrict to. Empty = show all.'),
});

export type SetEventNamesFilterInput = z.infer<
  typeof setEventNamesFilterSchema
>;

/**
 * Handler map for the client-side UI tools. Inputs are `unknown` to match Better
 * Agent's `toolHandlers`; the key set makes a new `.client()` tool fail to
 * compile until a handler is registered.
 */
export type ChatClientToolHandlers = {
  apply_filters: (input: unknown) => unknown | Promise<unknown>;
  set_property_filters: (input: unknown) => unknown | Promise<unknown>;
  set_event_names_filter: (input: unknown) => unknown | Promise<unknown>;
};
