import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Worker } from 'bullmq';
import express from 'express';

import { connection, eventsQueue } from '@mixan/queue';
import { cronQueue } from '@mixan/queue/src/queues';

import { cronJob } from './jobs/cron';
import { eventsJob } from './jobs/events';

const PORT = process.env.PORT || 3000;
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');
const app = express();

new Worker(eventsQueue.name, eventsJob, {
  connection,
});

new Worker(cronQueue.name, cronJob, {
  connection,
});

async function start() {
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
  // if (!repeatableJobs.find((job) => job.name === 'salt')) {
  //   console.log('Add salt job to queue');
  // }
}

start();
