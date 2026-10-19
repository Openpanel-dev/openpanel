import { z } from 'zod';

export type ChatProvider = 'openai' | 'anthropic';
export type ChatModelTier = 'fast' | 'balanced' | 'deep';
export type ChatReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high';

export interface ChatModelEntry {
  /** URL- and storage-safe id. */
  id: string;
  /** Native model id passed to the provider. */
  modelId: string;
  label: string;
  provider: ChatProvider;
  tier: ChatModelTier;
  reasoning: ChatReasoningEffort;
  description: string;
}

export const CHAT_MODELS = [
  {
    id: 'gpt-6-1-sol',
    modelId: 'gpt-6.1-sol',
    label: 'GPT-6.1 Sol',
    provider: 'openai',
    tier: 'balanced',
    reasoning: 'low',
    description: 'Quick and capable. The default.',
  },
  {
    id: 'gpt-5-4-mini',
    modelId: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    provider: 'openai',
    tier: 'fast',
    reasoning: 'low',
    description: 'Fastest and cheapest.',
  },
  {
    id: 'gpt-5-5',
    modelId: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'openai',
    tier: 'deep',
    reasoning: 'medium',
    description: 'Slower. Thinks harder on tricky analysis.',
  },
  {
    id: 'claude-sonnet-5-5',
    modelId: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    provider: 'anthropic',
    tier: 'balanced',
    reasoning: 'low',
    description: 'Quick and capable.',
  },
  {
    id: 'claude-haiku-5-5',
    modelId: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    provider: 'anthropic',
    tier: 'fast',
    reasoning: 'low',
    description: 'Fastest and cheapest.',
  },
  {
    id: 'claude-opus-5-5',
    modelId: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    provider: 'anthropic',
    tier: 'deep',
    reasoning: 'medium',
    description: 'Slower. Thinks harder on tricky analysis.',
  },
] as const satisfies readonly ChatModelEntry[];

export type ChatModelId = (typeof CHAT_MODELS)[number]['id'];

/** Bumped when the default changes so a stale pinned model does not stick. */
export const MODEL_STORAGE_KEY = 'op-chat-model-v3';

/** OpenAI first: Cloud already runs with that key. */
export const DEFAULT_MODEL_BY_PROVIDER = {
  openai: 'gpt-6-1-sol',
  anthropic: 'claude-sonnet-5-5',
} as const satisfies Record<ChatProvider, ChatModelId>;

export type ConfiguredProviders = Record<ChatProvider, boolean>;

export function isValidModelId(
  id: string | null | undefined
): id is ChatModelId {
  return !!id && CHAT_MODELS.some((model) => model.id === id);
}

export function getModelLabel(id: string): string {
  return CHAT_MODELS.find((model) => model.id === id)?.label ?? id;
}

export function getAvailableChatModels(
  providers: ConfiguredProviders
): ChatModelEntry[] {
  return CHAT_MODELS.filter((model) => providers[model.provider]);
}

export function getDefaultChatModelId(
  providers: ConfiguredProviders
): ChatModelId | null {
  if (providers.openai) {
    return DEFAULT_MODEL_BY_PROVIDER.openai;
  }
  if (providers.anthropic) {
    return DEFAULT_MODEL_BY_PROVIDER.anthropic;
  }
  return null;
}

/**
 * What the dashboard tells the chat about where it was opened from. Only the
 * cheap, stable facts: the page, an entity id and the visible date window.
 */
export const CHAT_HINT_PAGES = [
  'overview',
  'dashboard',
  'report',
  'profile',
  'session',
  'group',
  'pages',
  'seo',
  'events',
  'insights',
  'realtime',
] as const;

const MAX_ID_LENGTH = 128;
const MAX_RANGE_LENGTH = 32;

export const zChatLaunchHint = z.object({
  page: z.enum(CHAT_HINT_PAGES).optional(),
  dashboardId: z.string().max(MAX_ID_LENGTH).optional(),
  reportId: z.string().max(MAX_ID_LENGTH).optional(),
  profileId: z.string().max(MAX_ID_LENGTH).optional(),
  sessionId: z.string().max(MAX_ID_LENGTH).optional(),
  groupId: z.string().max(MAX_ID_LENGTH).optional(),
  range: z.string().max(MAX_RANGE_LENGTH).optional(),
  startDate: z.string().max(MAX_RANGE_LENGTH).optional(),
  endDate: z.string().max(MAX_RANGE_LENGTH).optional(),
  interval: z.string().max(MAX_RANGE_LENGTH).optional(),
});

export type ChatLaunchHint = z.infer<typeof zChatLaunchHint>;

export const CHAT_MESSAGE_ROLES = ['user', 'assistant'] as const;
export const CHAT_TRIGGERS = ['submit-message', 'regenerate-message'] as const;

const MAX_MESSAGE_ID_LENGTH = 64;

/** The one message the client sends per turn: the new user message, or the assistant message it responded to (tool approvals, client tool results). */
export const zChatRequestMessage = z.object({
  id: z.string().min(1).max(MAX_MESSAGE_ID_LENGTH),
  role: z.enum(CHAT_MESSAGE_ROLES),
  parts: z.array(z.record(z.string(), z.unknown())),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const zChatRequest = z.object({
  id: z.string().min(1).max(MAX_MESSAGE_ID_LENGTH),
  projectId: z.string().min(1),
  organizationId: z.string().min(1),
  modelId: z.string().optional(),
  trigger: z.enum(CHAT_TRIGGERS).default('submit-message'),
  messageId: z.string().max(MAX_MESSAGE_ID_LENGTH).optional(),
  message: zChatRequestMessage.optional(),
  hint: zChatLaunchHint.optional(),
});

export type ChatRequest = z.infer<typeof zChatRequest>;

export const zChatMessageMetadata = z.object({
  modelId: z.string().optional(),
  createdAt: z.number().optional(),
  totalTokens: z.number().optional(),
  durationMs: z.number().optional(),
});

export type ChatMessageMetadata = z.infer<typeof zChatMessageMetadata>;

/** Data parts the server streams besides the model output. */
export type ChatDataParts = Record<'title', { title: string }>;

/**
 * Where the assistant can send the user. Paths are relative to
 * `/:organizationId/:projectId` unless `scope` is `organization`.
 */
export const CHAT_ROUTES = {
  overview: {
    path: '',
    label: 'Overview',
    description:
      'Traffic overview: visitors, sessions, pageviews, referrers, devices, countries, live visitors.',
  },
  dashboards: {
    path: '/dashboards',
    label: 'Dashboards',
    description: 'All saved dashboards.',
  },
  dashboard: {
    path: '/dashboards/:dashboardId',
    label: 'Dashboard',
    description: 'One saved dashboard and its reports.',
    params: ['dashboardId'],
  },
  reportEditor: {
    path: '/reports',
    label: 'Report editor',
    description:
      'Build a new chart by hand: pick events, breakdowns, chart type.',
  },
  report: {
    path: '/reports/:reportId',
    label: 'Report',
    description: 'Edit one saved report.',
    params: ['reportId'],
  },
  insights: {
    path: '/insights',
    label: 'Insights',
    description: 'Automatic anomaly and trend insights.',
  },
  pages: {
    path: '/pages',
    label: 'Pages',
    description:
      'Page performance, entry and exit pages, conversions per page.',
  },
  seo: {
    path: '/seo',
    label: 'SEO',
    description:
      'Google Search Console queries and pages (needs the GSC integration).',
  },
  realtime: {
    path: '/realtime',
    label: 'Realtime',
    description: 'Who is on the site right now.',
  },
  events: {
    path: '/events',
    label: 'Events',
    description: 'Raw event stream with filters, conversions and event stats.',
  },
  sessions: {
    path: '/sessions',
    label: 'Sessions',
    description: 'Session list with session replays.',
  },
  session: {
    path: '/sessions/:sessionId',
    label: 'Session',
    description: 'One session: its events, path and replay.',
    params: ['sessionId'],
  },
  profiles: {
    path: '/profiles',
    label: 'Profiles',
    description: 'Identified and anonymous user profiles, power users.',
  },
  profile: {
    path: '/profiles/:profileId',
    label: 'Profile',
    description: 'One user profile with their sessions and events.',
    params: ['profileId'],
  },
  groups: {
    path: '/groups',
    label: 'Groups',
    description: 'Groups (accounts, companies) and their members.',
  },
  cohorts: {
    path: '/cohorts',
    label: 'Cohorts',
    description: 'Saved user cohorts.',
  },
  references: {
    path: '/references',
    label: 'References',
    description:
      'Annotations like launches, campaigns and deploys that show up on charts.',
  },
  notifications: {
    path: '/notifications',
    label: 'Notifications',
    description: 'Notification history.',
  },
  notificationRules: {
    path: '/notifications/rules',
    label: 'Notification rules',
    description: 'Alert rules: notify on events or funnel completions.',
  },
  integrations: {
    path: '/integrations',
    label: 'Integrations',
    description: 'Installed integrations (Slack, Discord, webhooks, exports).',
  },
  integrationsAvailable: {
    path: '/integrations/available',
    label: 'Available integrations',
    description: 'Integrations that can be installed.',
  },
  settings: {
    path: '/settings',
    label: 'Project settings',
    description: 'Project details: name, domain, timezone, CORS, filters.',
  },
  settingsClients: {
    path: '/settings/clients',
    label: 'API clients',
    description:
      'Client id and secret pairs used by SDKs and the API to send events.',
  },
  settingsTracking: {
    path: '/settings/tracking',
    label: 'Tracking setup',
    description: 'Install snippets and SDK setup for this project.',
  },
  settingsEvents: {
    path: '/settings/events',
    label: 'Event settings',
    description: 'Conversions, custom events and event metadata.',
  },
  settingsMcp: {
    path: '/settings/mcp',
    label: 'MCP server',
    description:
      'Connect Claude, Cursor or another AI client to this project with MCP.',
  },
  settingsGsc: {
    path: '/settings/gsc',
    label: 'Google Search Console',
    description: 'Connect Google Search Console for SEO data.',
  },
  settingsImports: {
    path: '/settings/imports',
    label: 'Imports',
    description: 'Import historical data from other tools.',
  },
  settingsWidgets: {
    path: '/settings/widgets',
    label: 'Widgets',
    description: 'Embeddable counters and live widgets.',
  },
  workspace: {
    path: '',
    label: 'Workspace',
    description: 'The organization: its projects.',
    scope: 'organization',
  },
  workspaceSettings: {
    path: '/settings',
    label: 'Workspace settings',
    description: 'Organization name, members, invites, billing.',
    scope: 'organization',
  },
} as const satisfies Record<
  string,
  {
    path: string;
    label: string;
    description: string;
    params?: readonly string[];
    scope?: 'organization';
  }
>;

export type ChatRouteKey = keyof typeof CHAT_ROUTES;

const CHAT_ROUTE_KEYS = Object.keys(CHAT_ROUTES) as [
  ChatRouteKey,
  ...ChatRouteKey[],
];

const MAX_REASON_LENGTH = 200;

export const zNavigateInput = z.object({
  route: z.enum(CHAT_ROUTE_KEYS),
  params: z
    .record(z.string(), z.string())
    .optional()
    .describe('Route params, e.g. { "profileId": "..." }.'),
  reason: z
    .string()
    .max(MAX_REASON_LENGTH)
    .optional()
    .describe('Short label shown on the navigation card.'),
});

export type NavigateInput = z.infer<typeof zNavigateInput>;

/** Dialogs the assistant can open with prefilled fields. Keys match the modal registry in the dashboard. */
export const CHAT_DIALOGS = {
  addClient: {
    label: 'Create API client',
    description:
      'Mint a client id and secret for an SDK or server. Fields: name, type (write | read | root).',
  },
  addDashboard: {
    label: 'Create dashboard',
    description: 'A new empty dashboard. Fields: name.',
  },
  addReference: {
    label: 'Add reference',
    description:
      'Annotate a date on every chart (launch, campaign, deploy). Fields: title, description, datetime.',
  },
  addNotificationRule: {
    label: 'Create notification rule',
    description: 'Alert on an event or a funnel. No prefill.',
  },
  addIntegration: {
    label: 'Add integration',
    description: 'Slack, Discord, webhook or export integrations. No prefill.',
  },
  addProject: {
    label: 'Create project',
    description: 'A new project in the workspace. Fields: name.',
  },
  inviteMember: {
    label: 'Invite member',
    description: 'Invite a teammate by email. No prefill.',
  },
  addCohort: {
    label: 'Create cohort',
    description: 'Save a user segment. No prefill.',
  },
} as const satisfies Record<string, { label: string; description: string }>;

export type ChatDialogKey = keyof typeof CHAT_DIALOGS;

const CHAT_DIALOG_KEYS = Object.keys(CHAT_DIALOGS) as [
  ChatDialogKey,
  ...ChatDialogKey[],
];

export const zOpenDialogInput = z.object({
  dialog: z.enum(CHAT_DIALOG_KEYS),
  prefill: z
    .record(z.string(), z.string())
    .optional()
    .describe('Field values to prefill where the dialog supports them.'),
});

export type OpenDialogInput = z.infer<typeof zOpenDialogInput>;

/** Tool names handled in the browser; the server declares them without `execute`. */
export const CHAT_CLIENT_TOOLS = ['navigate', 'open_dialog'] as const;
export type ChatClientToolName = (typeof CHAT_CLIENT_TOOLS)[number];
