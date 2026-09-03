// Moved into @openpanel/core's shared/ (M6-003): the day-gated sequence
// runner shared by the onboarding drip (now in core) and the wind-down track
// (cron.wind-down.ts, still here). Re-exported for that one remaining
// importer — same shape as packages/db/src/gsc.ts since M5-002.
export type {
  RunSequenceOptions,
  SequenceResult,
  SequenceStep,
  SequenceSubject,
  StepResult,
} from '@openpanel/core';
export { runSequence, step } from '@openpanel/core';
