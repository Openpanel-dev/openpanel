// The `ai_events` row and the draft of it the ingest API produces before the
// worker has resolved identity, session and time.

import type { AiEventKind } from '../ai.constants';
import type { AiCostSource } from './pricing/cost';

/** Everything in the row that is known at `/track` time. */
export interface AiEventRowDraft {
  type: AiEventKind;
  trace_id: string;
  /** Empty until the worker fills in the event id. */
  span_id: string;
  parent_id: string;
  conversation_id: string;
  name: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  cost_source: AiCostSource;
  latency_ms: number;
  time_to_first_token_ms: number;
  is_error: boolean;
  http_status: number;
  stop_reason: string;
  is_stream: boolean;
  /** JSON. */
  model_parameters: string;
  input: string;
  output: string;
  tools: string;
  error: string;
  /** The caller's custom properties, already flattened. */
  properties: Record<string, string>;
}

export interface IClickhouseAiEvent extends AiEventRowDraft {
  project_id: string;
  id: string;
  profile_id: string;
  device_id: string;
  session_id: string;
  groups: string[];
  /** ClickHouse DateTime64(3) text, UTC. */
  created_at: string;
}

/** The slice of the stored `events` row the ai row copies its identity from. */
export interface AiEventIdentitySource {
  id: string;
  project_id: string;
  profile_id: string;
  device_id: string;
  session_id: string;
  groups: string[];
  created_at: string;
}

export interface BuildAiEventRowOptions {
  /** `false` blanks input, output and tools (the project's privacy setting). */
  storeContent: boolean;
}

export function buildAiEventRow(
  draft: AiEventRowDraft,
  event: AiEventIdentitySource,
  options: BuildAiEventRowOptions
): IClickhouseAiEvent {
  return {
    ...draft,
    span_id: draft.span_id || event.id,
    input: options.storeContent ? draft.input : '',
    output: options.storeContent ? draft.output : '',
    tools: options.storeContent ? draft.tools : '',
    project_id: event.project_id,
    id: event.id,
    profile_id: event.profile_id,
    device_id: event.device_id,
    session_id: event.session_id,
    groups: event.groups,
    created_at: event.created_at,
  };
}
