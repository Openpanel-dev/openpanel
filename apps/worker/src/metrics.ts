import client from 'prom-client';

import { cronQueue, eventsQueue, sessionsQueue } from '@openpanel/queue';
import { redis } from '@openpanel/redis';

const Registry = client.Registry;

export const register = new Registry();

const queues = [eventsQueue, sessionsQueue, cronQueue];

queues.forEach((queue) => {
  register.registerMetric(
    new client.Gauge({
      name: `${queue.name}_active_count`,
      help: 'Active count',
      async collect() {
        const metric = await queue.getActiveCount();
        this.set(metric);
      },
    })
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name}_delayed_count`,
      help: 'Delayed count',
      async collect() {
        const metric = await queue.getDelayedCount();
        this.set(metric);
      },
    })
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name}_failed_count`,
      help: 'Failed count',
      async collect() {
        const metric = await queue.getFailedCount();
        this.set(metric);
      },
    })
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name}_completed_count`,
      help: 'Completed count',
      async collect() {
        const metric = await queue.getCompletedCount();
        this.set(metric);
      },
    })
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name}_waiting_count`,
      help: 'Waiting count',
      async collect() {
        const metric = await queue.getWaitingCount();
        this.set(metric);
      },
    })
  );
});

// Buffer
const buffers = ['events_v2', 'profiles'];

buffers.forEach((buffer) => {
  register.registerMetric(
    new client.Gauge({
      name: `buffer_${buffer}_count`,
      help: 'Number of users in the users array',
      async collect() {
        const metric = await redis.llen(`op:buffer:${buffer}`);
        this.set(metric);
      },
    })
  );

  register.registerMetric(
    new client.Gauge({
      name: `buffer_${buffer}_stalled_count`,
      help: 'Number of users in the users array',
      async collect() {
        const metric = await redis.llen(`op:buffer:${buffer}:stalled`);
        this.set(metric);
      },
    })
  );
});
