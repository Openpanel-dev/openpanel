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

const orderingDelayMs = Number.parseInt(
  process.env.ORDERING_DELAY_MS || '100',
  10,
);

export const eventsGroupQueue = new GroupQueue<
  EventsQueuePayloadIncomingEvent['payload']
>({
  logger: queueLogger,
  namespace: 'group_events',
  // @ts-expect-error - TODO: Fix this in groupmq
  redis: getRedisGroupQueue(),
  keepCompleted: 1_000,
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
