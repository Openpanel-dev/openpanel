import { ch } from '@openpanel/db/src/clickhouse/client';
import {
  createEngine,
  devicesModule,
  entryPagesModule,
  geoModule,
  insightStore,
  pageTrendsModule,
  referrersModule,
} from '@openpanel/db/src/services/insights';
import type {
  CronQueuePayload,
  InsightsQueuePayloadProject,
} from '@openpanel/queue';
import { insightsQueue } from '@openpanel/queue';
import type { Job } from 'bullmq';

const defaultEngineConfig = {
  keepTopNPerModuleWindow: 20,
  closeStaleAfterDays: 7,
  dimensionBatchSize: 50,
  globalThresholds: {
    minTotal: 200,
    minAbsDelta: 80,
    minPct: 0.15,
  },
};

export async function insightsDailyJob(job: Job<CronQueuePayload>) {
  const projectIds = await insightStore.listProjectIdsForCadence('daily');
  const date = new Date().toISOString().slice(0, 10);

  for (const projectId of projectIds) {
    await insightsQueue.add(
      'insightsProject',
      {
        type: 'insightsProject',
        payload: { projectId, date },
      },
      {
        jobId: `daily:${date}:${projectId}`, // idempotent
      },
    );
  }
}

export async function insightsProjectJob(
  job: Job<InsightsQueuePayloadProject>,
) {
  const { projectId, date } = job.data.payload;
  const engine = createEngine({
    store: insightStore,
    modules: [
      referrersModule,
      entryPagesModule,
      pageTrendsModule,
      geoModule,
      devicesModule,
    ],
    db: ch,
    config: defaultEngineConfig,
  });

  const projectCreatedAt = await insightStore.getProjectCreatedAt(projectId);

  await engine.runProject({
    projectId,
    cadence: 'daily',
    now: new Date(date),
    projectCreatedAt,
  });
}
