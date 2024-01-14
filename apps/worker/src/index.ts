import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Worker } from 'bullmq';
import express from 'express';

import { connection, eventsQueue } from '@mixan/queue';

import { eventsJob } from './jobs/events';

const PORT = process.env.PORT || 3001;
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');
const app = express();

new Worker(eventsQueue.name, eventsJob, {
  connection,
});

createBullBoard({
  queues: [new BullMQAdapter(eventsQueue)],
  serverAdapter: serverAdapter,
});

app.use('/', serverAdapter.getRouter());

app.listen(PORT, () => {
  console.log(`For the UI, open http://localhost:${PORT}/`);
});
