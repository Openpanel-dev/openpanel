// The SaaS archetype's AI assistant. Every turn is one agent trace, shaped
// like what `withAiContext` + the `@openpanel/ai` middleware send: a root
// `ai_trace`, an optional retrieval span wrapping its embedding, a model call,
// tool spans when the model asks for them, and the model call that answers.

import {
  AI_ANSWERS,
  AI_EMBEDDING_MODEL,
  AI_ERRORS,
  AI_FEATURES,
  AI_MODELS,
  AI_PREMIUM_MODEL,
  AI_QUESTIONS,
  AI_TOOL_CALLS,
  AI_TOOLS,
  type SeedAiModel,
  type SeedAiTool,
} from '../data/ai';
import type { Rng } from '../rng';
import { Journey, type SeedAiEvent } from './archetype';

/** Share of product visits that talk to the assistant, by plan. */
const AI_VISIT_CHANCE: Record<string, number> = {
  free: 0.25,
  pro: 0.5,
  team: 0.65,
  enterprise: 0.75,
};

/** The backend's hourly job that summarises what changed, with no user behind it. */
const INSIGHT_JOB_FEATURE = 'insight-summary';
const INSIGHT_JOB_NAME = 'hourly-insights';
const INSIGHT_JOB_TRACES_MAX = 3;
const INSIGHT_JOB_JITTER_SECONDS = 300;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;

interface FeatureProfile {
  retrievalChance: number;
  toolChance: number;
  premiumChance: number;
}

const FEATURE_PROFILES: Record<string, FeatureProfile> = {
  'assistant-chat': {
    retrievalChance: 0.4,
    toolChance: 0.45,
    premiumChance: 0,
  },
  'report-draft': { retrievalChance: 0.2, toolChance: 0.7, premiumChance: 0.3 },
  'insight-explain': { retrievalChance: 0, toolChance: 0, premiumChance: 0 },
  [INSIGHT_JOB_FEATURE]: {
    retrievalChance: 0,
    toolChance: 1,
    premiumChance: 0,
  },
};
const DEFAULT_PROFILE: FeatureProfile = {
  retrievalChance: 0,
  toolChance: 0,
  premiumChance: 0,
};

const AI_TURNS_MAX = 6;
const AI_TOOL_CALLS_MAX = 2;
const AI_ERROR_CHANCE = 0.03;
const AI_RETRY_CHANCE = 0.5;
const AI_FALLBACK_MODEL = 'claude-haiku-5-5';
const AI_CACHE_HIT_CHANCE = 0.4;
const AI_CACHE_HIT_MAX_SHARE = 0.8;
const AI_INPUT_MEDIAN_TOKENS = 1800;
const AI_INPUT_SIGMA = 0.5;
const AI_OUTPUT_SIGMA = 0.6;
const AI_LATENCY_SIGMA = 0.45;
const AI_FAILED_LATENCY_SHARE = 0.5;
const AI_STREAM_CHANCE = 0.85;
const AI_TTFT_SHARE = 0.2;
const AI_RETRIEVAL_LATENCY_MEDIAN_MS = 80;
const AI_EMBEDDING_TOKENS_MEDIAN = 24;
const AI_CONTEXT_TOKENS_PER_TURN = 400;
const AI_TEMPERATURE = 0.2;
const MS_PER_SECOND = 1000;
const COST_DECIMALS = 10;

/**
 * A provider incident every few days, in the afternoon (UTC): errors and
 * latency jump, so the error-rate and latency charts have something to show.
 */
const INCIDENT_EVERY_DAYS = 5;
const INCIDENT_START_HOUR = 13;
const INCIDENT_END_HOUR = 16;
const INCIDENT_ERROR_CHANCE = 0.35;
const INCIDENT_LATENCY_FACTOR = 2.2;
const DAY_MS = 86_400_000;

interface TurnContext {
  traceId: string;
  rootSpanId: string;
  conversationId: string;
  feature: string;
  base: Record<string, unknown>;
}

interface GenerationResult {
  failed: boolean;
  latencyMs: number;
  error: (typeof AI_ERRORS)[number]['value'] | null;
}

export function aiVisitChance(plan: string): number {
  return AI_VISIT_CHANCE[plan] ?? 0;
}

export function assistantConversation(
  rng: Rng,
  journey: Journey,
  plan: string,
  projectId: string
): void {
  const conversationId = `conv_${rng.hex(12)}`;
  const feature = rng.pick(AI_FEATURES);
  const turns = rng.int(1, AI_TURNS_MAX);
  const base = { feature, plan, project: projectId };

  journey.view(`/projects/${projectId}/ai-assistant`, 'AI assistant', {
    project: projectId,
  });
  for (let turn = 0; turn < turns; turn++) {
    const failed = agentTurn(rng, journey, turn, {
      traceId: `trace_${rng.hex(16)}`,
      rootSpanId: `span_${rng.hex(16)}`,
      conversationId,
      feature,
      base,
    });
    if (failed) {
      break;
    }
  }
  journey.event('feature_used', {
    feature: 'ai-assistant',
    project: projectId,
  });
}

/** One journey per hour of `day`, each a run of the insight job. */
export function insightJobs(
  rng: Rng,
  day: Date,
  dwellMedianSeconds: number
): Journey[] {
  const journeys: Journey[] = [];
  for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
    const start = new Date(
      day.getTime() +
        hour * MS_PER_HOUR +
        rng.int(0, INSIGHT_JOB_JITTER_SECONDS) * MS_PER_SECOND
    );
    const journey = new Journey(rng, start, dwellMedianSeconds, null);
    const traces = rng.int(1, INSIGHT_JOB_TRACES_MAX);
    for (let trace = 0; trace < traces; trace++) {
      agentTurn(rng, journey, 0, {
        traceId: `trace_${rng.hex(16)}`,
        rootSpanId: `span_${rng.hex(16)}`,
        conversationId: '',
        feature: INSIGHT_JOB_FEATURE,
        base: { feature: INSIGHT_JOB_FEATURE, job: INSIGHT_JOB_NAME },
      });
    }
    journeys.push(journey);
  }
  return journeys;
}

/** Plays one turn as a trace; returns whether it ended in an error. */
function agentTurn(
  rng: Rng,
  journey: Journey,
  turn: number,
  context: TurnContext
): boolean {
  const profile = FEATURE_PROFILES[context.feature] ?? DEFAULT_PROFILE;
  const question = rng.one(AI_QUESTIONS);
  const answer = rng.one(AI_ANSWERS);
  const model = rng.chance(profile.premiumChance)
    ? AI_PREMIUM_MODEL
    : rng.pick(AI_MODELS);
  const tools = rng.chance(profile.toolChance)
    ? Array.from({ length: rng.int(1, AI_TOOL_CALLS_MAX) }, () =>
        rng.pick(AI_TOOL_CALLS)
      )
    : [];

  // Children run inside the root, so it is written first and the clock only
  // moves as they do; its latency is known once they are planned.
  const rootAt = journey.events.length;
  journey.ai(
    'ai_trace',
    {},
    emptyAiRow(context, 'trace', context.rootSpanId, ''),
    0
  );

  let totalMs = 0;
  if (rng.chance(profile.retrievalChance)) {
    totalMs += retrieval(rng, journey, context, question);
  }
  let contextTokens = turn * AI_CONTEXT_TOKENS_PER_TURN;
  let result = generation(rng, journey, context, {
    model,
    question,
    answer,
    contextTokens,
    toolCall: tools.length > 0,
    toolNames: tools.map((tool) => tool.name),
    turn,
  });
  totalMs += result.latencyMs;

  if (result.failed && rng.chance(AI_RETRY_CHANCE)) {
    result = generation(rng, journey, context, {
      model: fallbackModel(),
      question,
      answer,
      contextTokens,
      toolCall: false,
      toolNames: [],
      turn,
    });
    totalMs += result.latencyMs;
  } else if (!result.failed && tools.length > 0) {
    for (const tool of tools) {
      totalMs += toolSpan(rng, journey, context, tool, question);
      contextTokens += tool.resultTokens;
    }
    result = generation(rng, journey, context, {
      model,
      question,
      answer,
      contextTokens,
      toolCall: false,
      toolNames: [],
      turn,
    });
    totalMs += result.latencyMs;
  }

  fillRoot(journey, rootAt, context, {
    question,
    answer,
    totalMs,
    failed: result.failed,
    error: result.error,
  });
  return result.failed;
}

function fillRoot(
  journey: Journey,
  index: number,
  context: TurnContext,
  outcome: {
    question: string;
    answer: string;
    totalMs: number;
    failed: boolean;
    error: GenerationResult['error'];
  }
): void {
  const root = journey.events[index];
  if (!root?.ai) {
    return;
  }
  root.properties = {
    ...traceProperties(context),
    ai_name: context.feature,
    ai_latency_ms: outcome.totalMs,
    ai_is_error: outcome.failed,
    ai_error_code: outcome.error?.code,
  };
  root.ai = {
    ...root.ai,
    name: context.feature,
    latency_ms: outcome.totalMs,
    is_error: outcome.failed,
    http_status: outcome.error?.httpStatus ?? 0,
    input: JSON.stringify(outcome.question),
    output: outcome.failed ? '' : JSON.stringify(outcome.answer),
    error: outcome.error ? JSON.stringify(outcome.error) : '',
    properties: stringProperties(context.base),
  };
}

/** A `search-docs` span with the question's embedding inside it. */
function retrieval(
  rng: Rng,
  journey: Journey,
  context: TurnContext,
  question: string
): number {
  const searchSpanId = `span_${rng.hex(16)}`;
  const embeddingTokens = tokenCount(rng, AI_EMBEDDING_TOKENS_MEDIAN, 0.3);
  const embeddingCost = roundCost(
    embeddingTokens * AI_EMBEDDING_MODEL.inputPrice
  );
  const embeddingMs = latency(rng, AI_EMBEDDING_MODEL.latencyMedian);
  const searchMs = embeddingMs + latency(rng, AI_RETRIEVAL_LATENCY_MEDIAN_MS);

  journey.ai(
    'ai_span',
    {
      ...traceProperties(context),
      ai_name: 'search-docs',
      ai_latency_ms: searchMs,
      ai_is_error: false,
    },
    {
      ...emptyAiRow(context, 'span', searchSpanId, context.rootSpanId),
      name: 'search-docs',
      latency_ms: searchMs,
      input: JSON.stringify({ query: question, limit: 5 }),
      output: JSON.stringify({ hits: rng.int(0, 5) }),
    },
    0
  );
  journey.ai(
    'ai_embedding',
    {
      ...traceProperties(context),
      ai_name: 'embed-question',
      ai_model: AI_EMBEDDING_MODEL.model,
      ai_provider: AI_EMBEDDING_MODEL.provider,
      ai_input_tokens: embeddingTokens,
      ai_total_tokens: embeddingTokens,
      ai_cost: embeddingCost,
      ai_latency_ms: embeddingMs,
      ai_is_error: false,
    },
    {
      ...emptyAiRow(context, 'embedding', `span_${rng.hex(16)}`, searchSpanId),
      name: 'embed-question',
      model: AI_EMBEDDING_MODEL.model,
      provider: AI_EMBEDDING_MODEL.provider,
      input_tokens: embeddingTokens,
      input_cost: embeddingCost,
      total_cost: embeddingCost,
      cost_source: 'catalog',
      latency_ms: embeddingMs,
      input: JSON.stringify([question]),
    },
    searchMs / MS_PER_SECOND
  );
  return searchMs;
}

function toolSpan(
  rng: Rng,
  journey: Journey,
  context: TurnContext,
  tool: SeedAiTool,
  question: string
): number {
  const toolMs = latency(rng, tool.latencyMedian);
  journey.ai(
    'ai_span',
    {
      ...traceProperties(context),
      ai_name: tool.name,
      ai_latency_ms: toolMs,
      ai_is_error: false,
    },
    {
      ...emptyAiRow(context, 'span', `span_${rng.hex(16)}`, context.rootSpanId),
      name: tool.name,
      latency_ms: toolMs,
      input: JSON.stringify({ question }),
      output: JSON.stringify({ rows: rng.int(1, 40) }),
    },
    toolMs / MS_PER_SECOND
  );
  return toolMs;
}

interface GenerationInput {
  model: SeedAiModel;
  question: string;
  answer: string;
  contextTokens: number;
  toolCall: boolean;
  /** Tools the model asks for; empty when it answers directly. */
  toolNames: string[];
  turn: number;
}

function generation(
  rng: Rng,
  journey: Journey,
  context: TurnContext,
  call: GenerationInput
): GenerationResult {
  const { model } = call;
  const incident = isIncident(journey.now);
  const failed = rng.chance(incident ? INCIDENT_ERROR_CHANCE : AI_ERROR_CHANCE);
  const error = failed ? errorFor(rng, incident) : null;
  const inputTokens =
    tokenCount(rng, AI_INPUT_MEDIAN_TOKENS, AI_INPUT_SIGMA) +
    call.contextTokens;
  const cacheReadTokens =
    call.turn > 0 && rng.chance(AI_CACHE_HIT_CHANCE)
      ? Math.round(inputTokens * rng.float() * AI_CACHE_HIT_MAX_SHARE)
      : 0;
  const outputTokens = failed
    ? 0
    : tokenCount(rng, model.outputMedian, AI_OUTPUT_SIGMA);
  const reasoningTokens = Math.round(outputTokens * model.reasoningShare);
  const slowdown =
    (incident ? INCIDENT_LATENCY_FACTOR : 1) *
    (failed ? AI_FAILED_LATENCY_SHARE : 1);
  const latencyMs = Math.round(latency(rng, model.latencyMedian) * slowdown);
  const cost = generationCost(
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens
  );
  const stream = rng.chance(AI_STREAM_CHANCE);
  const timeToFirstTokenMs =
    stream && !failed ? Math.round(latencyMs * AI_TTFT_SHARE) : 0;
  const stopReason = stopReasonFor(failed, call.toolCall);
  const output = failed
    ? []
    : [{ role: 'assistant', content: assistantContent(call) }];

  journey.ai(
    'ai_generation',
    {
      ...traceProperties(context),
      ai_name: context.feature,
      ai_model: model.model,
      ai_provider: model.provider,
      ai_input_tokens: inputTokens,
      ai_output_tokens: outputTokens,
      ai_cache_read_tokens: cacheReadTokens,
      ai_reasoning_tokens: reasoningTokens || undefined,
      ai_total_tokens: inputTokens + outputTokens,
      ai_cost: cost.total,
      ai_latency_ms: latencyMs,
      ai_time_to_first_token_ms: timeToFirstTokenMs || undefined,
      ai_is_error: failed,
      ai_error_code: error?.code,
      ai_http_status: error?.httpStatus,
      ai_stop_reason: stopReason || undefined,
      ai_stream: stream,
    },
    {
      ...emptyAiRow(
        context,
        'generation',
        `span_${rng.hex(16)}`,
        context.rootSpanId
      ),
      name: context.feature,
      model: model.model,
      provider: model.provider,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      reasoning_tokens: reasoningTokens,
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
      input: JSON.stringify([
        {
          role: 'system',
          content: 'You are the OpenPanel analytics assistant.',
        },
        { role: 'user', content: call.question },
      ]),
      output: JSON.stringify(output),
      tools: JSON.stringify(AI_TOOLS),
      error: error ? JSON.stringify(error) : '',
    },
    latencyMs / MS_PER_SECOND
  );
  return { failed, latencyMs, error };
}

function assistantContent(call: GenerationInput): unknown {
  if (!call.toolCall) {
    return call.answer;
  }
  return call.toolNames.map((toolName) => ({
    type: 'tool_call',
    toolName,
    input: { question: call.question },
  }));
}

function stopReasonFor(failed: boolean, toolCall: boolean): string {
  if (failed) {
    return '';
  }
  return toolCall ? 'tool-calls' : 'stop';
}

function errorFor(
  rng: Rng,
  incident: boolean
): (typeof AI_ERRORS)[number]['value'] {
  const rateLimit = AI_ERRORS[0]?.value;
  if (incident && rateLimit) {
    return rateLimit;
  }
  return rng.pick(AI_ERRORS);
}

function fallbackModel(): SeedAiModel {
  const fallback = AI_MODELS.find(
    (entry) => entry.value.model === AI_FALLBACK_MODEL
  );
  return fallback?.value ?? AI_PREMIUM_MODEL;
}

function isIncident(at: Date): boolean {
  const day = Math.floor(at.getTime() / DAY_MS);
  const hour = at.getUTCHours();
  return (
    day % INCIDENT_EVERY_DAYS === 0 &&
    hour >= INCIDENT_START_HOUR &&
    hour < INCIDENT_END_HOUR
  );
}

function generationCost(
  model: SeedAiModel,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number
): { input: number; output: number; total: number } {
  const input =
    (inputTokens - cacheReadTokens) * model.inputPrice +
    cacheReadTokens * model.cacheReadPrice;
  const output = outputTokens * model.outputPrice;
  return {
    input: roundCost(input),
    output: roundCost(output),
    total: roundCost(input + output),
  };
}

function traceProperties(context: TurnContext): Record<string, unknown> {
  return {
    ...context.base,
    ai_trace_id: context.traceId,
    ai_conversation_id: context.conversationId,
  };
}

function latency(rng: Rng, median: number): number {
  return Math.round(rng.logNormalSeconds(median, AI_LATENCY_SIGMA));
}

function tokenCount(rng: Rng, median: number, sigma: number): number {
  return Math.max(1, Math.round(rng.logNormalSeconds(median, sigma)));
}

function roundCost(value: number): number {
  return Number(value.toFixed(COST_DECIMALS));
}

function stringProperties(
  properties: Record<string, unknown>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, String(value)])
  );
}

function emptyAiRow(
  context: TurnContext,
  type: SeedAiEvent['type'],
  spanId: string,
  parentId: string
): SeedAiEvent {
  return {
    type,
    trace_id: context.traceId,
    span_id: spanId,
    parent_id: parentId,
    conversation_id: context.conversationId,
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
    properties: stringProperties(context.base),
  };
}
