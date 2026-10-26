// What the ingest pipeline needs from this module. Query functions for the
// dashboard arrive with the AI section.

export type { NormalizedAiEvent } from './src/normalize';
export { normalizeAiPayload, serializeBounded } from './src/normalize';
export { resolveModelPrice } from './src/pricing/catalog';
export type { AiCost, AiCostSource } from './src/pricing/cost';
export { calculateAiCost } from './src/pricing/cost';
export type {
  AiEventIdentitySource,
  AiEventRowDraft,
  IClickhouseAiEvent,
} from './src/row';
export { buildAiEventRow } from './src/row';
