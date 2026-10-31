// The models, features and prices the SaaS archetype's assistant uses. Prices
// are USD per token, copied from core's catalog by hand so the seed stays out
// of the backend's dependency graph; they only have to be plausible.

import type { Weighted } from '../rng';

export interface SeedAiModel {
  model: string;
  provider: string;
  inputPrice: number;
  outputPrice: number;
  cacheReadPrice: number;
  /** Median output tokens; cheap models answer shorter. */
  outputMedian: number;
  /** Median latency in ms. */
  latencyMedian: number;
  /** Share of output tokens spent reasoning; reasoning models only. */
  reasoningShare: number;
}

export const AI_MODELS: readonly Weighted<SeedAiModel>[] = [
  {
    weight: 50,
    value: {
      model: 'gpt-5-mini',
      provider: 'openai',
      inputPrice: 2.5e-7,
      outputPrice: 2e-6,
      cacheReadPrice: 2.5e-8,
      outputMedian: 180,
      latencyMedian: 1400,
      reasoningShare: 0,
    },
  },
  {
    weight: 25,
    value: {
      model: 'claude-sonnet-5-5',
      provider: 'anthropic',
      inputPrice: 2e-6,
      outputPrice: 1e-5,
      cacheReadPrice: 1e-7,
      outputMedian: 320,
      latencyMedian: 2600,
      reasoningShare: 0.25,
    },
  },
  {
    weight: 15,
    value: {
      model: 'gpt-5.5',
      provider: 'openai',
      inputPrice: 1.25e-6,
      outputPrice: 1e-5,
      cacheReadPrice: 1.25e-7,
      outputMedian: 400,
      latencyMedian: 3200,
      reasoningShare: 0.6,
    },
  },
  {
    weight: 10,
    value: {
      model: 'claude-haiku-5-5',
      provider: 'anthropic',
      inputPrice: 1e-7,
      outputPrice: 5e-7,
      cacheReadPrice: 1e-8,
      outputMedian: 120,
      latencyMedian: 900,
      reasoningShare: 0,
    },
  },
];

/** The expensive model the report drafter escalates to. */
export const AI_PREMIUM_MODEL: SeedAiModel = {
  model: 'claude-opus-5-5',
  provider: 'anthropic',
  inputPrice: 1.5e-5,
  outputPrice: 7.5e-5,
  cacheReadPrice: 1.5e-6,
  outputMedian: 650,
  latencyMedian: 6500,
  reasoningShare: 0.4,
};

export const AI_EMBEDDING_MODEL: SeedAiModel = {
  model: 'text-embedding-3-small',
  provider: 'openai',
  inputPrice: 2e-8,
  outputPrice: 0,
  cacheReadPrice: 0,
  outputMedian: 0,
  latencyMedian: 120,
  reasoningShare: 0,
};

/** What the product uses the assistant for; `ai_name` on the generation. */
export const AI_FEATURES: readonly Weighted<string>[] = [
  { weight: 60, value: 'assistant-chat' },
  { weight: 25, value: 'report-draft' },
  { weight: 15, value: 'insight-explain' },
];

export const AI_QUESTIONS = [
  'How many signups did we get last week?',
  'Which referrer converts best to paid?',
  'Show me retention for users who connected Slack.',
  'Why did sessions drop on Tuesday?',
  'Draft a funnel from pricing to subscription.',
  'What are the top pages for mobile visitors?',
  'Compare this month to last month.',
  'Which features do enterprise accounts use most?',
] as const;

export const AI_ANSWERS = [
  'Signups were up 12% week over week, driven mostly by organic search.',
  'Referral traffic converts at 4.1%, twice the rate of paid ads.',
  'Users who connected Slack retain at 58% on day 30, against 34% overall.',
  'Tuesday had a tracking outage between 09:00 and 11:00 UTC.',
  'Here is a funnel with three steps: pricing, checkout and subscription.',
  'The top mobile pages are /dashboard, /projects and /pricing.',
  'Sessions are up 8% and revenue is flat compared with last month.',
  'Enterprise accounts lean on funnels, cohorts and exports.',
] as const;

export const AI_TOOLS = [
  { type: 'function', name: 'get_report_data', description: 'Run a report' },
  { type: 'function', name: 'list_event_names', description: 'List events' },
  { type: 'function', name: 'get_funnel', description: 'Run a funnel' },
] as const;

export interface SeedAiTool {
  name: (typeof AI_TOOLS)[number]['name'];
  /** Median tool latency in ms; queries are slower than lookups. */
  latencyMedian: number;
  /** Tokens the result adds to the next model call. */
  resultTokens: number;
}

export const AI_TOOL_CALLS: readonly Weighted<SeedAiTool>[] = [
  {
    weight: 55,
    value: { name: 'get_report_data', latencyMedian: 450, resultTokens: 1400 },
  },
  {
    weight: 25,
    value: { name: 'list_event_names', latencyMedian: 60, resultTokens: 300 },
  },
  {
    weight: 20,
    value: { name: 'get_funnel', latencyMedian: 700, resultTokens: 900 },
  },
];

export const AI_ERRORS: readonly Weighted<{
  message: string;
  code: string;
  httpStatus: number;
}>[] = [
  {
    weight: 60,
    value: {
      message: 'Rate limit exceeded',
      code: 'rate_limit_exceeded',
      httpStatus: 429,
    },
  },
  {
    weight: 25,
    value: {
      message: 'The server had an error processing your request',
      code: 'server_error',
      httpStatus: 500,
    },
  },
  {
    weight: 15,
    value: { message: 'Request timed out', code: 'timeout', httpStatus: 504 },
  },
];
