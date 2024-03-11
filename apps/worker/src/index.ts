import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { WorkerOptions } from 'bullmq';
import { Worker } from 'bullmq';
import express from 'express';

import { connection, eventsQueue } from '@openpanel/queue';
import { cronQueue } from '@openpanel/queue/src/queues';

import { cronJob } from './jobs/cron';
import { eventsJob } from './jobs/events';

const PORT = parseInt(process.env.WORKER_PORT || '3000', 10);
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');
const app = express();

const workerOptions: WorkerOptions = {
  connection,
  concurrency: parseInt(process.env.CONCURRENCY || '1', 10),
};

async function start() {
  new Worker(eventsQueue.name, eventsJob, workerOptions);

  new Worker(cronQueue.name, cronJob, workerOptions);

  createBullBoard({
    queues: [new BullMQAdapter(eventsQueue), new BullMQAdapter(cronQueue)],
    serverAdapter: serverAdapter,
  });

  app.use('/', serverAdapter.getRouter());

  app.listen(PORT, () => {
    console.log(`For the UI, open http://localhost:${PORT}/`);
  });

  const repeatableJobs = await cronQueue.getRepeatableJobs();

  console.log(repeatableJobs);

  await cronQueue.add(
    'salt',
    {
      type: 'salt',
      payload: undefined,
    },
    {
      jobId: 'salt',
      repeat: {
        utc: true,
        pattern: '0 0 * * *',
      },
    }
  );
}

start();
