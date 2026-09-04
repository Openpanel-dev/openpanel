import './utils/observability';

import { createInitialSalts } from '@openpanel/db';
import client from 'prom-client';
import sourceMapSupport from 'source-map-support';
import { createApp } from './app';
import { bootCron } from './boot-cron';
import { bootWorkers } from './boot-workers';
import { register } from './metrics';
import { logger } from './utils/logger';

sourceMapSupport.install();

async function start() {
  const collectDefaultMetrics = client.collectDefaultMetrics;
  collectDefaultMetrics({ register });

  const PORT = Number.parseInt(process.env.WORKER_PORT || '3000', 10);
  const app = createApp();

  app.listen(PORT, () => {
    logger.info(`For the UI, open http://localhost:${PORT}/`);
  });

  if (process.env.DISABLE_WORKERS === undefined) {
    await bootWorkers();
    await bootCron();
  } else {
    logger.warn('Workers are disabled');
  }

  await createInitialSalts();
}

start();
