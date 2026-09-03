// Dissolved into @openpanel/core's import module (M5-004): the ClickHouse
// staging/session pipeline, the provider dispatch and the job body itself
// moved to packages/core/src/modules/import/import.service.ts. This file
// stays (DELEGATE PATTERN) — it is the BullMQ job body V1's worker registers
// (boot-workers.ts), a thin wrapper handing the real BullMQ `Job` to
// `runImportJob` as its progress reporter (`ImportJobProgress` — a BullMQ
// `Job` satisfies it structurally, see import.service.ts's header).
import { runImportJob } from '@openpanel/core';
import type { ImportQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';

export async function importJob(job: Job<ImportQueuePayload>) {
  const { importId } = job.data.payload;
  return runImportJob(importId, job);
}
