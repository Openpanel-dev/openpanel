import client from 'prom-client';

import {
  botBuffer,
  eventBuffer,
  profileBuffer,
  sessionBuffer,
} from '@openpanel/db';
import { cronQueue, eventsGroupQueues, sessionsQueue } from '@openpanel/queue';

const Registry = client.Registry;

export const register = new Registry();

const queues = [sessionsQueue, cronQueue, ...eventsGroupQueues];

// Histogram to track job processing time for eventsGroupQueues
export const eventsGroupJobDuration = new client.Histogram({
  name: 'events_group_job_duration_ms',
  help: 'Duration of job processing in eventsGroupQueues (in ms)',
  labelNames: ['queue_shard', 'status'],
  buckets: [10, 25, 50, 100, 250, 500, 750, 1000, 2000, 5000, 10000, 30000], // 10ms to 30s
  registers: [register],
});

register.registerMetric(eventsGroupJobDuration);

register.registerMetric(
  new client.Gauge({
    name: `buffer_${eventBuffer.name}_retry_count`,
    help: 'Retry buffer size',
    async collect() {
      const metric = await eventBuffer.getRetryBufferSize();
      this.set(metric);
    },
  }),
);

register.registerMetric(
  new client.Gauge({
    name: `buffer_${eventBuffer.name}_dlq_count`,
    help: 'DLQ buffer size',
    async collect() {
      const metric = await eventBuffer.getDLQSize();
      this.set(metric);
    },
  }),
);

queues.forEach((queue) => {
  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[\{\}]/g, '')}_active_count`,
      help: 'Active count',
      async collect() {
        const metric = await queue.getActiveCount();
        this.set(metric);
      },
    }),
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[\{\}]/g, '')}_delayed_count`,
      help: 'Delayed count',
      async collect() {
        const metric = await queue.getDelayedCount();
        this.set(metric);
      },
    }),
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[\{\}]/g, '')}_failed_count`,
      help: 'Failed count',
      async collect() {
        const metric = await queue.getFailedCount();
        this.set(metric);
      },
    }),
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[\{\}]/g, '')}_completed_count`,
      help: 'Completed count',
      async collect() {
        const metric = await queue.getCompletedCount();
        this.set(metric);
      },
    }),
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[\{\}]/g, '')}_waiting_count`,
      help: 'Waiting count',
      async collect() {
        const metric = await queue.getWaitingCount();
        this.set(metric);
      },
    }),
  );
});

register.registerMetric(
  new client.Gauge({
    name: `buffer_${eventBuffer.name}_count`,
    help: 'Number of unprocessed events',
    async collect() {
      const metric = await eventBuffer.getBufferSize();
      this.set(metric);
    },
  }),
);

register.registerMetric(
  new client.Gauge({
    name: `buffer_${profileBuffer.name}_count`,
    help: 'Number of unprocessed profiles',
    async collect() {
      const metric = await profileBuffer.getBufferSize();
      this.set(metric);
    },
  }),
);

register.registerMetric(
  new client.Gauge({
    name: `buffer_${botBuffer.name}_count`,
    help: 'Number of unprocessed bot events',
    async collect() {
      const metric = await botBuffer.getBufferSize();
      this.set(metric);
    },
  }),
);

register.registerMetric(
  new client.Gauge({
    name: `buffer_${sessionBuffer.name}_count`,
    help: 'Number of unprocessed sessions',
    async collect() {
      const metric = await sessionBuffer.getBufferSize();
      this.set(metric);
    },
  }),
);
