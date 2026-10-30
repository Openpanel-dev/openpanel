// Acme SaaS: a logged-in product. Everyone identifies on the first session,
// so retention is real. Funnels: activation (signup → project → SDK → first
// event) spread over visits, and monetization (pricing → checkout →
// subscription). Cohort-worthy behaviours: invited a teammate, exported,
// connected an integration, paid plan.

import {
  AI_ANSWERS,
  AI_EMBEDDING_MODEL,
  AI_ERRORS,
  AI_FEATURES,
  AI_MODELS,
  AI_QUESTIONS,
  AI_TOOLS,
  type SeedAiModel,
} from '../data/ai';
import { newPerson } from '../data/people';
import { REFERRERS } from '../data/referrers';
import type { Person, Visitor } from '../model';
import type { Rng, Weighted } from '../rng';
import type { Archetype, Journey, SeedAiEvent } from './archetype';

interface Plan {
  name: string;
  price: number;
}

const PLANS: readonly Weighted<Plan>[] = [
  { weight: 70, value: { name: 'free', price: 0 } },
  { weight: 18, value: { name: 'pro', price: 29 } },
  { weight: 9, value: { name: 'team', price: 99 } },
  { weight: 3, value: { name: 'enterprise', price: 299 } },
];
const PAID_PLANS = PLANS.filter((plan) => plan.value.price > 0);
const ROLES = ['founder', 'engineer', 'product', 'marketing', 'data'] as const;
const COMPANY_SIZES = [
  '1',
  '2-10',
  '11-50',
  '51-200',
  '201-1000',
  '1000+',
] as const;
const SIGNUP_SOURCES = [
  'organic',
  'referral',
  'ads',
  'producthunt',
  'docs',
] as const;
const ONBOARDING_STEPS = [
  'organization',
  'project',
  'install',
  'verify',
] as const;
const PROJECT_TYPES = ['website', 'app', 'backend'] as const;
const SDKS = [
  'web',
  'react',
  'next',
  'react-native',
  'node',
  'python',
] as const;
const FEATURES = [
  'funnels',
  'retention',
  'cohorts',
  'pages',
  'realtime',
  'profiles',
  'insights',
  'ai-assistant',
] as const;
const INTEGRATIONS = ['slack', 'discord', 'webhook', 'gsc', 'stripe'] as const;
const REPORT_TYPES = [
  'overview',
  'funnel',
  'retention',
  'pages',
  'events',
  'cohort',
] as const;
const CANCEL_REASONS = [
  'too_expensive',
  'missing_feature',
  'not_using',
  'switched',
] as const;
const PROJECT_IDS = [
  'web',
  'ios',
  'android',
  'landing',
  'internal',
  'staging',
] as const;

const SIGNUP_COMPLETED_CHANCE = 0.85;
const ONBOARDING_STEP_CHANCE = 0.75;
const SDK_INSTALLED_CHANCE = 0.55;
const FIRST_EVENT_CHANCE = 0.8;
const PRICING_VIEWED_CHANCE = 0.06;
const CHECKOUT_CHANCE = 0.45;
const SUBSCRIBED_CHANCE = 0.6;
const CHURN_CHANCE = 0.004;
const INVITE_CHANCE = 0.05;
const EXPORT_CHANCE = 0.05;
const INTEGRATION_CHANCE = 0.03;
const REPORT_CREATED_CHANCE = 0.15;
const FEATURE_CHANCE = 0.5;
const SETTINGS_CHANCE = 0.1;

interface SaasState {
  plan?: Plan;
  onboardingStep?: number;
  projectCreated?: boolean;
  sdkInstalled?: boolean;
  firstEvent?: boolean;
  invited?: boolean;
  exported?: boolean;
  integrated?: boolean;
  churned?: boolean;
}

function stateOf(visitor: Visitor): SaasState {
  return visitor.state as SaasState;
}

function personProps(person: Person): Record<string, string> {
  return person.properties;
}

/** Activation is spread over visits: each session moves the user at most a step or two. */
function activation(rng: Rng, journey: Journey, state: SaasState): void {
  const step = state.onboardingStep ?? 0;
  if (step < ONBOARDING_STEPS.length) {
    if (!rng.chance(ONBOARDING_STEP_CHANCE)) {
      return;
    }
    journey.view('/onboarding', 'Onboarding', { step: step + 1 });
    journey.event('onboarding_step_completed', {
      step: step + 1,
      name: ONBOARDING_STEPS[step],
    });
    state.onboardingStep = step + 1;
    if (ONBOARDING_STEPS[step] === 'project') {
      journey.event('project_created', {
        type: rng.one(PROJECT_TYPES),
        timezone: rng.one([
          'UTC',
          'Europe/Stockholm',
          'America/New_York',
          'Asia/Tokyo',
        ]),
      });
      state.projectCreated = true;
    }
    return;
  }
  if (
    state.projectCreated &&
    !state.sdkInstalled &&
    rng.chance(SDK_INSTALLED_CHANCE)
  ) {
    journey.view('/projects/web/connect', 'Connect your app');
    journey.event('sdk_installed', {
      sdk: rng.one(SDKS),
      framework: rng.one(['next', 'vite', 'remix', 'expo', 'express', 'none']),
    });
    state.sdkInstalled = true;
    return;
  }
  if (
    state.sdkInstalled &&
    !state.firstEvent &&
    rng.chance(FIRST_EVENT_CHANCE)
  ) {
    journey.event('first_event_received', {
      latency_seconds: rng.int(5, 900),
      event_name: rng.one(['screen_view', 'signup', 'purchase']),
    });
    state.firstEvent = true;
  }
}

function monetization(
  rng: Rng,
  journey: Journey,
  state: SaasState,
  person: Person
): void {
  const plan = state.plan ?? { name: 'free', price: 0 };
  if (plan.price === 0 && rng.chance(PRICING_VIEWED_CHANCE)) {
    journey.view('/settings/billing', 'Billing');
    journey.event('pricing_viewed', { current_plan: plan.name });
    if (!rng.chance(CHECKOUT_CHANCE)) {
      return;
    }
    const chosen = rng.pick(PAID_PLANS);
    const interval = rng.one(['monthly', 'yearly']);
    journey.event('checkout_started', { plan: chosen.name, interval });
    if (!rng.chance(SUBSCRIBED_CHANCE)) {
      return;
    }
    const seats = chosen.name === 'pro' ? 1 : rng.int(2, 25);
    journey.event('subscription_started', {
      plan: chosen.name,
      interval,
      seats,
      mrr: chosen.price,
      previous_plan: plan.name,
    });
    journey.revenue(interval === 'yearly' ? chosen.price * 10 : chosen.price, {
      plan: chosen.name,
      interval,
      seats,
    });
    state.plan = chosen;
    person.properties.plan = chosen.name;
    return;
  }
  if (plan.price > 0 && rng.chance(CHURN_CHANCE)) {
    journey.view('/settings/billing', 'Billing');
    journey.event('subscription_cancelled', {
      plan: plan.name,
      reason: rng.one(CANCEL_REASONS),
      months_active: rng.int(1, 18),
    });
    state.plan = { name: 'free', price: 0 };
    state.churned = true;
    person.properties.plan = 'free';
  }
}

/** Share of product sessions that talk to the assistant, by plan. */
const AI_SESSION_CHANCE: Record<string, number> = {
  free: 0.12,
  pro: 0.3,
  team: 0.42,
  enterprise: 0.5,
};
const AI_TURNS_MAX = 4;
const AI_RETRIEVAL_CHANCE = 0.35;
const AI_ERROR_CHANCE = 0.04;
const AI_TOOL_CALL_CHANCE = 0.3;
const AI_CACHE_HIT_CHANCE = 0.4;
const AI_INPUT_MEDIAN_TOKENS = 1800;
const AI_INPUT_SIGMA = 0.5;
const AI_OUTPUT_SIGMA = 0.6;
const AI_LATENCY_SIGMA = 0.45;
const AI_STREAM_CHANCE = 0.85;
const AI_TTFT_SHARE = 0.2;
const AI_RETRIEVAL_LATENCY_MEDIAN_MS = 80;
const AI_EMBEDDING_TOKENS_MEDIAN = 24;
const AI_CONTEXT_TOKENS_PER_TURN = 400;
const MS_PER_SECOND = 1000;
const COST_DECIMALS = 10;
const AI_TEMPERATURE = 0.2;

function roundCost(value: number): number {
  return Number(value.toFixed(COST_DECIMALS));
}

function tokenCount(rng: Rng, median: number, sigma: number): number {
  return Math.max(1, Math.round(rng.logNormalSeconds(median, sigma)));
}

interface AiCall {
  model: SeedAiModel;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
}

function generationCost(call: AiCall): {
  input: number;
  output: number;
  total: number;
} {
  const { model } = call;
  const input =
    (call.inputTokens - call.cacheReadTokens) * model.inputPrice +
    call.cacheReadTokens * model.cacheReadPrice;
  const output = call.outputTokens * model.outputPrice;
  return {
    input: roundCost(input),
    output: roundCost(output),
    total: roundCost(input + output),
  };
}

/** The flat `ai_*` keys the worker stores on the `events` row for a model call. */
function generationProperties(
  call: AiCall,
  context: Record<string, unknown>,
  cost: number
): Record<string, unknown> {
  return {
    ...context,
    ai_model: call.model.model,
    ai_provider: call.model.provider,
    ai_input_tokens: call.inputTokens,
    ai_output_tokens: call.outputTokens,
    ai_cache_read_tokens: call.cacheReadTokens,
    ai_total_tokens: call.inputTokens + call.outputTokens,
    ai_cost: cost,
    ai_latency_ms: call.latencyMs,
  };
}

/**
 * One assistant conversation: a few turns, each one trace with an optional
 * embedding + retrieval span before the generation. Mirrors what the
 * `@openpanel/ai` middleware and `op.ai()` send, so the AI pages, the report
 * builder and the profile timeline have realistic data.
 */
function assistantConversation(
  rng: Rng,
  journey: Journey,
  state: SaasState,
  projectId: string
): void {
  const plan = state.plan?.name ?? 'free';
  const conversationId = `conv_${rng.hex(12)}`;
  const feature = rng.pick(AI_FEATURES);
  const turns = rng.int(1, AI_TURNS_MAX);
  const base = { feature, plan, project: projectId };

  journey.view(`/projects/${projectId}/ai-assistant`, 'AI assistant', {
    project: projectId,
  });

  for (let turn = 0; turn < turns; turn++) {
    const traceId = `trace_${rng.hex(16)}`;
    const trace = {
      ...base,
      ai_trace_id: traceId,
      ai_conversation_id: conversationId,
    };
    const question = rng.one([...AI_QUESTIONS]);
    const answer = rng.one([...AI_ANSWERS]);

    if (rng.chance(AI_RETRIEVAL_CHANCE)) {
      const embeddingTokens = tokenCount(rng, AI_EMBEDDING_TOKENS_MEDIAN, 0.3);
      const embeddingCost = roundCost(
        embeddingTokens * AI_EMBEDDING_MODEL.inputPrice
      );
      const embeddingLatency = Math.round(
        rng.logNormalSeconds(AI_EMBEDDING_MODEL.latencyMedian, AI_LATENCY_SIGMA)
      );
      journey.ai(
        'ai_embedding',
        {
          ...trace,
          ai_name: 'embed-question',
          ai_model: AI_EMBEDDING_MODEL.model,
          ai_provider: AI_EMBEDDING_MODEL.provider,
          ai_input_tokens: embeddingTokens,
          ai_total_tokens: embeddingTokens,
          ai_cost: embeddingCost,
          ai_latency_ms: embeddingLatency,
          ai_is_error: false,
        },
        {
          ...emptyAiRow(traceId, conversationId, 'embedding'),
          name: 'embed-question',
          model: AI_EMBEDDING_MODEL.model,
          provider: AI_EMBEDDING_MODEL.provider,
          input_tokens: embeddingTokens,
          input_cost: embeddingCost,
          total_cost: embeddingCost,
          cost_source: 'catalog',
          latency_ms: embeddingLatency,
          input: JSON.stringify([question]),
          properties: stringProperties(base),
        },
        embeddingLatency / MS_PER_SECOND
      );
      const retrievalLatency = Math.round(
        rng.logNormalSeconds(AI_RETRIEVAL_LATENCY_MEDIAN_MS, AI_LATENCY_SIGMA)
      );
      journey.ai(
        'ai_span',
        {
          ...trace,
          ai_name: 'search-docs',
          ai_latency_ms: retrievalLatency,
          ai_is_error: false,
        },
        {
          ...emptyAiRow(traceId, conversationId, 'span'),
          name: 'search-docs',
          latency_ms: retrievalLatency,
          input: JSON.stringify({ query: question, limit: 5 }),
          output: JSON.stringify({ hits: rng.int(0, 5) }),
          properties: stringProperties(base),
        },
        retrievalLatency / MS_PER_SECOND
      );
    }

    const model = rng.pick(AI_MODELS);
    const inputTokens =
      tokenCount(rng, AI_INPUT_MEDIAN_TOKENS, AI_INPUT_SIGMA) +
      turn * AI_CONTEXT_TOKENS_PER_TURN;
    const cacheReadTokens =
      turn > 0 && rng.chance(AI_CACHE_HIT_CHANCE)
        ? Math.round(inputTokens * rng.float() * 0.8)
        : 0;
    const failed = rng.chance(AI_ERROR_CHANCE);
    const outputTokens = failed
      ? 0
      : tokenCount(rng, model.outputMedian, AI_OUTPUT_SIGMA);
    const latencyMs = Math.round(
      rng.logNormalSeconds(model.latencyMedian, AI_LATENCY_SIGMA) *
        (failed ? 0.5 : 1)
    );
    const call: AiCall = {
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      latencyMs,
    };
    const cost = generationCost(call);
    const stream = rng.chance(AI_STREAM_CHANCE);
    const timeToFirstTokenMs =
      stream && !failed ? Math.round(latencyMs * AI_TTFT_SHARE) : 0;
    const usedTool = !failed && rng.chance(AI_TOOL_CALL_CHANCE);
    const stopReason = failed ? '' : usedTool ? 'tool-calls' : 'stop';
    const error = failed ? rng.pick(AI_ERRORS) : null;
    const input = [
      { role: 'system', content: 'You are the OpenPanel analytics assistant.' },
      { role: 'user', content: question },
    ];
    const output = failed
      ? []
      : [
          {
            role: 'assistant',
            content: usedTool
              ? [
                  {
                    type: 'tool_call',
                    toolName: 'get_report_data',
                    input: { question },
                  },
                  { type: 'text', text: answer },
                ]
              : answer,
          },
        ];

    journey.ai(
      'ai_generation',
      {
        ...generationProperties(call, trace, cost.total),
        ai_name: feature,
        ai_time_to_first_token_ms: timeToFirstTokenMs || undefined,
        ai_is_error: failed,
        ai_error_code: error?.code,
        ai_http_status: error?.httpStatus,
        ai_stop_reason: stopReason || undefined,
        ai_stream: stream,
      },
      {
        ...emptyAiRow(traceId, conversationId, 'generation'),
        name: feature,
        model: model.model,
        provider: model.provider,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        input_cost: cost.input,
        output_cost: cost.output,
        total_cost: cost.total,
        cost_source: 'catalog',
        latency_ms: latencyMs,
        time_to_first_token_ms: timeToFirstTokenMs,
        is_error: failed,
        http_status: error?.httpStatus ?? 0,
        stop_reason: stopReason,
        is_stream: stream,
        model_parameters: JSON.stringify({ temperature: AI_TEMPERATURE }),
        input: JSON.stringify(input),
        output: JSON.stringify(output),
        tools: JSON.stringify(AI_TOOLS),
        error: error ? JSON.stringify(error) : '',
        properties: stringProperties(base),
      },
      latencyMs / MS_PER_SECOND
    );
  }
  journey.event('feature_used', {
    feature: 'ai-assistant',
    project: projectId,
  });
}

function stringProperties(
  properties: Record<string, unknown>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, String(value)])
  );
}

function emptyAiRow(
  traceId: string,
  conversationId: string,
  type: SeedAiEvent['type']
): SeedAiEvent {
  return {
    type,
    trace_id: traceId,
    span_id: '',
    parent_id: '',
    conversation_id: conversationId,
    name: '',
    model: '',
    provider: '',
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    input_cost: 0,
    output_cost: 0,
    total_cost: 0,
    cost_source: 'none',
    latency_ms: 0,
    time_to_first_token_ms: 0,
    is_error: false,
    http_status: 0,
    stop_reason: '',
    is_stream: false,
    model_parameters: '',
    input: '',
    output: '',
    tools: '',
    error: '',
    properties: {},
  };
}

function usage(rng: Rng, journey: Journey, state: SaasState): void {
  const visits = rng.int(1, 3);
  for (let i = 0; i < visits; i++) {
    const projectId = rng.one(PROJECT_IDS);
    journey.view(`/projects/${projectId}`, `Project ${projectId}`, {
      project: projectId,
    });
    if (rng.chance(FEATURE_CHANCE)) {
      const feature = rng.one(FEATURES);
      journey.view(`/projects/${projectId}/${feature}`, feature, {
        project: projectId,
      });
      journey.event('feature_used', { feature, project: projectId });
    }
    if (rng.chance(AI_SESSION_CHANCE[state.plan?.name ?? 'free'] ?? 0)) {
      assistantConversation(rng, journey, state, projectId);
    }
    if (rng.chance(0.6)) {
      journey.event('report_viewed', {
        report_type: rng.one(REPORT_TYPES),
        range: rng.one(['7d', '30d', '90d', 'custom']),
        project: projectId,
      });
    }
    if (rng.chance(REPORT_CREATED_CHANCE)) {
      journey.event('report_created', {
        chart: rng.one(['line', 'bar', 'funnel', 'retention', 'pie']),
        breakdowns: rng.int(0, 2),
        project: projectId,
      });
    }
    if (rng.chance(EXPORT_CHANCE)) {
      journey.event('export_completed', {
        format: rng.one(['csv', 'json']),
        rows: rng.int(100, 200_000),
      });
      state.exported = true;
    }
  }
  if (rng.chance(INVITE_CHANCE)) {
    journey.view('/settings/members', 'Members');
    journey.event('invite_sent', { role: rng.one(['admin', 'member']) });
    state.invited = true;
  } else if (rng.chance(INTEGRATION_CHANCE)) {
    journey.view('/settings/integrations', 'Integrations');
    journey.event('integration_connected', { provider: rng.one(INTEGRATIONS) });
    state.integrated = true;
  } else if (rng.chance(SETTINGS_CHANCE)) {
    journey.view('/settings', 'Settings');
  }
}

export const saasArchetype: Archetype = {
  id: 'saas',
  projectName: 'Acme SaaS',
  origin: 'https://app.acme.test',
  domain: 'https://app.acme.test',
  types: ['website', 'backend'],
  sdk: { name: 'web', version: '1.0.5' },
  shape: {
    hourly: [
      0.5, 0.3, 0.2, 0.2, 0.3, 0.6, 1.5, 3.5, 6, 7, 7, 6, 5.5, 6.5, 7, 6.5, 6,
      5, 3.5, 2.5, 2, 1.5, 1, 0.8,
    ],
    dayOfWeek: [0.2, 1.2, 1.25, 1.25, 1.2, 1.0, 0.2],
    trendPerWeek: 0.015,
    spikeChance: 0.01,
    dipChance: 0.03,
    spikeRange: [1.5, 2.5],
    dipRange: [0.3, 0.6],
  },
  trafficShare: 0.2,
  returningShare: 0.75,
  retention: { sameDay: 0.35, day1: 0.55, day7: 0.4, day30: 0.3 },
  stickiness(visitor) {
    const state = stateOf(visitor);
    if (state.churned) {
      return 0.3;
    }
    let value = (state.plan?.price ?? 0) > 0 ? 3 : 1;
    if (state.invited) {
      value += 1;
    }
    if (state.firstEvent) {
      value += 0.5;
    }
    return value;
  },
  mobileShare: 0.12,
  deviceClass: 'web',
  referrers: [
    { weight: 70, value: null },
    { weight: 15, value: REFERRERS.google },
    { weight: 8, value: REFERRERS.gmail },
    { weight: 4, value: REFERRERS.gitHub },
    { weight: 3, value: REFERRERS.linkedIn },
  ],
  campaignChance: 0.03,
  dwellMedianSeconds: 45,
  utcOffsetHours: -2,
  newPerson(rng) {
    const person = newPerson(rng, { business: true });
    person.properties = {
      plan: 'free',
      role: rng.one(ROLES),
      company_size: rng.one(COMPANY_SIZES),
      signup_source: rng.one(SIGNUP_SOURCES),
    };
    return person;
  },
  identity:
    'Everyone signs up or logs in on their first session and is identified from then on; retention is real.',
  conversions: ['signup_completed', 'sdk_installed', 'subscription_started'],
  funnels: [
    {
      name: 'Activation',
      steps: [
        'signup_completed',
        'project_created',
        'sdk_installed',
        'first_event_received',
      ],
      breakdowns: ['signup_source', 'company_size', 'role', 'sdk'],
    },
    {
      name: 'Upgrade',
      steps: ['pricing_viewed', 'checkout_started', 'subscription_started'],
      breakdowns: ['plan', 'interval', 'company_size'],
    },
  ],
  journey(rng, journey, visitor) {
    const state = stateOf(visitor);
    const person = visitor.person;
    if (!person) {
      return;
    }

    if (!visitor.identified) {
      journey.view('/signup', 'Create your account');
      const method = rng.one(['email', 'github', 'google']);
      journey.event('signup_started', { method });
      if (!rng.chance(SIGNUP_COMPLETED_CHANCE)) {
        return;
      }
      journey.identify(person);
      journey.event('signup_completed', { method, ...personProps(person) });
      state.plan = rng.pick(PLANS.filter((plan) => plan.value.price === 0));
    } else if (visitor.sessions === 0 || rng.chance(0.15)) {
      // A known user on a new device, or a session that expired.
      journey.view('/login', 'Log in');
      journey.event('login', {
        method: rng.one(['email', 'github', 'google']),
      });
    }

    journey.view('/dashboard', 'Dashboard', {
      plan: state.plan?.name ?? 'free',
    });
    activation(rng, journey, state);
    if (
      state.onboardingStep !== undefined &&
      state.onboardingStep >= ONBOARDING_STEPS.length
    ) {
      usage(rng, journey, state);
      monetization(rng, journey, state, person);
    }
  },
};
