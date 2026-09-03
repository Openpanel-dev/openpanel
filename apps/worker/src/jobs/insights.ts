// Dissolved into @openpanel/core's insight module (M5-001): the engine run +
// tier-1 AI enrichment moved to
// packages/core/src/modules/insight/insight.service.ts. This file stays
// (DELEGATE PATTERN) — it is the BullMQ job body V1's worker registers
// (boot-workers.ts, boot-debug.ts) and the `cron.ts` dispatcher's
// `insightsDaily` case, both thin wrappers around the core functions.
import {
  listDailyInsightCandidates,
  runProjectInsights,
} from '@openpanel/core';
import type {
  CronQueuePayload,
  InsightsQueuePayloadProject,
} from '@openpanel/queue';
import { insightsQueue } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { logger as baseLogger } from '@/utils/logger';

const logger = baseLogger.child({ job: 'insights' });

export async function insightsDailyJob(_job: Job<CronQueuePayload>) {
  const date = new Date().toISOString().slice(0, 10);
  const candidates = await listDailyInsightCandidates(date);

  for (const { projectId, date: candidateDate } of candidates) {
    await insightsQueue.add(
      'insightsProject',
      {
        type: 'insightsProject',
        payload: { projectId, date: candidateDate },
      },
      {
        jobId: `daily:${candidateDate}:${projectId}`, // idempotent
      }
    );
  }
}

export async function insightsProjectJob(
  job: Job<InsightsQueuePayloadProject>
) {
  const { projectId, date } = job.data.payload;
  await runProjectInsights({ projectId, date, logger });
}
