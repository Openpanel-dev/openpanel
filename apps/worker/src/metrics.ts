import client from 'prom-client';

import {
  botBuffer,
  db,
  eventBuffer,
  profileBuffer,
  sessionBuffer,
} from '@openpanel/db';
import { cronQueue, eventsQueue, sessionsQueue } from '@openpanel/queue';

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
    }),
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name}_delayed_count`,
      help: 'Delayed count',
      async collect() {
        const metric = await queue.getDelayedCount();
        this.set(metric);
      },
    }),
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name}_failed_count`,
      help: 'Failed count',
      async collect() {
        const metric = await queue.getFailedCount();
        this.set(metric);
      },
    }),
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name}_completed_count`,
      help: 'Completed count',
      async collect() {
        const metric = await queue.getCompletedCount();
        this.set(metric);
      },
    }),
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name}_waiting_count`,
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
