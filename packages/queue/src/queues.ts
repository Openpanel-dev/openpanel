import { Queue, QueueEvents } from 'bullmq';

import type {
  IServiceCreateEventPayload,
  IServiceEvent,
  Prisma,
} from '@openpanel/db';
import { createLogger } from '@openpanel/logger';
import { getRedisGroupQueue, getRedisQueue } from '@openpanel/redis';
import type { TrackPayload } from '@openpanel/sdk';
import { Queue as GroupQueue } from 'groupmq';

export const queueLogger = createLogger({ name: 'queue' });

export interface EventsQueuePayloadIncomingEvent {
  type: 'incomingEvent';
  payload: {
    projectId: string;
    event: TrackPayload & {
      timestamp: string;
      isTimestampFromThePast: boolean;
    };
    geo: {
      country: string | undefined;
      city: string | undefined;
      region: string | undefined;
      longitude: number | undefined;
      latitude: number | undefined;
    };
    headers: Record<string, string | undefined>;
    currentDeviceId: string;
    previousDeviceId: string;
  };
}
export interface EventsQueuePayloadCreateEvent {
  type: 'createEvent';
  payload: Omit<IServiceEvent, 'id'>;
}

export interface EventsQueuePayloadCreateSessionEnd {
  type: 'createSessionEnd';
  payload: IServiceCreateEventPayload;
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
export type CronQueuePayloadProject = {
  type: 'deleteProjects';
  payload: undefined;
};
export type CronQueuePayload =
  | CronQueuePayloadSalt
  | CronQueuePayloadFlushEvents
  | CronQueuePayloadFlushSessions
  | CronQueuePayloadFlushProfiles
  | CronQueuePayloadPing
  | CronQueuePayloadProject;

export type MiscQueuePayloadTrialEndingSoon = {
  type: 'trialEndingSoon';
  payload: {
    organizationId: string;
  };
};

export type MiscQueuePayload = MiscQueuePayloadTrialEndingSoon;

export type CronQueueType = CronQueuePayload['type'];

const orderingWindowMs = Number.parseInt(
  process.env.ORDERING_WINDOW_MS || '50',
  10,
);
const orderingGracePeriodDecay = Number.parseFloat(
  process.env.ORDERING_GRACE_PERIOD_DECAY || '0.9',
);
const orderingMaxWaitMultiplier = Number.parseInt(
  process.env.ORDERING_MAX_WAIT_MULTIPLIER || '8',
  10,
);

export const eventsGroupQueue = new GroupQueue<
  EventsQueuePayloadIncomingEvent['payload']
>({
  logger: queueLogger,
  namespace: 'group_events',
  redis: getRedisGroupQueue(),
  orderingMethod: 'in-memory',
  orderingWindowMs,
  orderingGracePeriodDecay,
  orderingMaxWaitMultiplier,
  keepCompleted: 10,
  keepFailed: 10_000,
});

export const sessionsQueue = new Queue<SessionsQueuePayload>('sessions', {
  // @ts-ignore
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});
export const sessionsQueueEvents = new QueueEvents('sessions', {
  // @ts-ignore
  connection: getRedisQueue(),
});

export const cronQueue = new Queue<CronQueuePayload>('cron', {
  // @ts-ignore
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});

export const miscQueue = new Queue<MiscQueuePayload>('misc', {
  // @ts-ignore
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
  },
});

export type NotificationQueuePayload = {
  type: 'sendNotification';
  payload: {
    notification: Prisma.NotificationUncheckedCreateInput;
  };
};

export const notificationQueue = new Queue<NotificationQueuePayload>(
  'notification',
  {
    // @ts-ignore
    connection: getRedisQueue(),
    defaultJobOptions: {
      removeOnComplete: 10,
    },
  },
);

export type ImportQueuePayload = {
  type: 'import';
  payload: {
    importId: string;
  };
};

export const importQueue = new Queue<ImportQueuePayload>('import', {
  connection: getRedisQueue(),
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

export function addTrialEndingSoonJob(organizationId: string, delay: number) {
  return miscQueue.add(
    'misc',
    {
      type: 'trialEndingSoon',
      payload: {
        organizationId,
      },
    },
    {
      delay,
    },
  );
}
