import type {
  IClickhouseSession,
  IServiceCreateEventPayload,
  IServiceEvent,
  Prisma,
} from '@openpanel/db';
import { createLogger } from '@openpanel/logger';
import { getRedisQueue } from '@openpanel/redis';
import { Queue } from 'bullmq';
import type { ITrackPayload } from '../../validation';

export const getQueueName = (name: string) =>
  process.env.QUEUE_CLUSTER ? `{${name}}` : name;

export const queueLogger = createLogger({ name: 'queue' });

// BullMQ re-emits ioredis connection errors on every Queue instance; with no
// 'error' listener Node throws them as uncaughtException and kills the
// process (the api died ~daily from idle-socket ECONNRESETs, see
// api-crash-econnreset-plan.md). ioredis reconnects on its own — log and
// continue.
const guardQueue = <
  T extends { on(event: 'error', listener: (error: Error) => void): unknown },
>(
  queue: T,
  name: string
): T => {
  queue.on('error', (error) => {
    queueLogger.error({ err: error, queue: name }, 'queue connection error');
  });
  return queue;
};

export interface EventsQueuePayloadIncomingEvent {
  type: 'incomingEvent';
  payload: {
    projectId: string;
    event: ITrackPayload & {
      timestamp: string | number;
      isTimestampFromThePast: boolean;
    };
    uaInfo:
      | {
          readonly isServer: true;
          readonly device: 'server';
          readonly os: '';
          readonly osVersion: '';
          readonly browser: '';
          readonly browserVersion: '';
          readonly brand: '';
          readonly model: '';
        }
      | {
          readonly os: string | undefined;
          readonly osVersion: string | undefined;
          readonly browser: string | undefined;
          readonly browserVersion: string | undefined;
          readonly device: string;
          readonly brand: string | undefined;
          readonly model: string | undefined;
          readonly isServer: false;
        };
    geo: {
      country: string | undefined;
      city: string | undefined;
      region: string | undefined;
      longitude: number | undefined;
      latitude: number | undefined;
    };
    headers: Record<string, string | undefined>;
    deviceId: string;
    sessionId: string;
  };
}
export interface EventsQueuePayloadCreateEvent {
  type: 'createEvent';
  payload: Omit<IServiceEvent, 'id'>;
}

export interface EventsQueuePayloadCreateSessionEnd {
  type: 'createSessionEnd';
  payload: IServiceCreateEventPayload;
  // Snapshot of the session at the moment the close was decided. Used as a
  // fallback when the live Redis blob has expired by the time the job runs,
  // and to detect post-enqueue extensions (so we don't close a session that
  // received more events in the meantime).
  snapshot: IClickhouseSession;
}

// TODO: Rename `EventsQueuePayloadCreateSessionEnd`
export type SessionsQueuePayload = EventsQueuePayloadCreateSessionEnd;

export type EventsQueuePayload =
  | EventsQueuePayloadCreateEvent
  | EventsQueuePayloadCreateSessionEnd
  | EventsQueuePayloadIncomingEvent;

export type CronQueuePayloadSalt = {
  type: 'salt';
  payload: undefined;
};
export type CronQueuePayloadFlushEvents = {
  type: 'flushEvents';
  payload: undefined;
};
export type CronQueuePayloadFlushProfiles = {
  type: 'flushProfiles';
  payload: undefined;
};
export type CronQueuePayloadFlushSessions = {
  type: 'flushSessions';
  payload: undefined;
};
export type CronQueuePayloadPing = {
  type: 'ping';
  payload: undefined;
};
export type CronQueuePayloadDelete = {
  type: 'delete';
  payload: undefined;
};
export type CronQueuePayloadInsightsDaily = {
  type: 'insightsDaily';
  payload: undefined;
};
export type CronQueuePayloadOnboarding = {
  type: 'onboarding';
  payload: undefined;
};
export type CronQueuePayloadFlushProfileBackfill = {
  type: 'flushProfileBackfill';
  payload: undefined;
};
export type CronQueuePayloadFlushReplay = {
  type: 'flushReplay';
  payload: undefined;
};
export type CronQueuePayloadGscSync = {
  type: 'gscSync';
  payload: undefined;
};
export type CronQueuePayloadFlushGroups = {
  type: 'flushGroups';
  payload: undefined;
};
export type CronQueuePayloadCohortRefresh = {
  type: 'cohortRefresh';
  payload: undefined;
};
export type CronQueuePayloadSessionReaper = {
  type: 'sessionReaper';
  payload: undefined;
};
export type CronQueuePayloadSessionVacuum = {
  type: 'sessionVacuum';
  payload: undefined;
};
export type CronQueuePayloadInsightCleanup = {
  type: 'insightCleanup';
  payload: undefined;
};
export type CronQueuePayloadWeeklyDigest = {
  type: 'weeklyDigest';
  payload: undefined;
};
export type CronQueuePayloadDataHealth = {
  type: 'dataHealth';
  payload: undefined;
};
export type CronQueuePayloadWindDown = {
  type: 'windDown';
  payload: undefined;
};
export type CronQueuePayloadFlushExports = {
  type: 'flushExports';
  payload: undefined;
};
export type CronQueuePayload =
  | CronQueuePayloadSalt
  | CronQueuePayloadFlushEvents
  | CronQueuePayloadFlushSessions
  | CronQueuePayloadFlushProfiles
  | CronQueuePayloadFlushProfileBackfill
  | CronQueuePayloadFlushReplay
  | CronQueuePayloadFlushGroups
  | CronQueuePayloadFlushExports
  | CronQueuePayloadPing
  | CronQueuePayloadDelete
  | CronQueuePayloadInsightsDaily
  | CronQueuePayloadOnboarding
  | CronQueuePayloadGscSync
  | CronQueuePayloadCohortRefresh
  | CronQueuePayloadSessionReaper
  | CronQueuePayloadSessionVacuum
  | CronQueuePayloadInsightCleanup
  | CronQueuePayloadWeeklyDigest
  | CronQueuePayloadDataHealth
  | CronQueuePayloadWindDown;

export type CronQueueType = CronQueuePayload['type'];

export const sessionsQueue = guardQueue(
  new Queue<SessionsQueuePayload>(getQueueName('sessions'), {
    connection: getRedisQueue(),
    defaultJobOptions: {
      removeOnComplete: true,
    },
  }),
  'sessions'
);

export const cronQueue = guardQueue(
  new Queue<CronQueuePayload>(getQueueName('cron'), {
    connection: getRedisQueue(),
    defaultJobOptions: {
      removeOnComplete: 10,
    },
  }),
  'cron'
);

export type NotificationQueuePayload = {
  type: 'sendNotification';
  payload: {
    notification: Prisma.NotificationUncheckedCreateInput;
  };
};

export const notificationQueue = guardQueue(
  new Queue<NotificationQueuePayload>(getQueueName('notification'), {
    connection: getRedisQueue(),
    defaultJobOptions: {
      removeOnComplete: 10,
    },
  }),
  'notification'
);

export type ImportQueuePayload = {
  type: 'import';
  payload: {
    importId: string;
  };
};

export const importQueue = guardQueue(
  new Queue<ImportQueuePayload>(getQueueName('import'), {
    connection: getRedisQueue(),
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  }),
  'import'
);

export type InsightsQueuePayloadProject = {
  type: 'insightsProject';
  payload: { projectId: string; date: string };
};

export const insightsQueue = guardQueue(
  new Queue<InsightsQueuePayloadProject>(getQueueName('insights'), {
    connection: getRedisQueue(),
    defaultJobOptions: {
      removeOnComplete: 100,
    },
  }),
  'insights'
);

export type GscQueuePayloadSync = {
  type: 'gscProjectSync';
  payload: { projectId: string };
};
export type GscQueuePayloadBackfill = {
  type: 'gscProjectBackfill';
  payload: { projectId: string };
};
export type GscQueuePayload = GscQueuePayloadSync | GscQueuePayloadBackfill;

export const gscQueue = guardQueue(
  new Queue<GscQueuePayload>(getQueueName('gsc'), {
    connection: getRedisQueue(),
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  }),
  'gsc'
);

export type CohortComputePayload = {
  cohortId: string;
};

export const cohortComputeQueue = guardQueue(
  new Queue<CohortComputePayload>(getQueueName('cohortCompute'), {
    connection: getRedisQueue(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      // `age` alone only trims when another job in this queue finishes, so pair
      // it with a count bound to keep the completed/failed sets from growing
      // unbounded during quiet periods.
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86_400, count: 100 },
    },
  }),
  'cohortCompute'
);
