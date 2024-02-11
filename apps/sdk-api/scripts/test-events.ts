import { omit, prop, uniqBy } from 'ramda';

import { generateProfileId, getTime, toISOString } from '@mixan/common';
import type { Event, IServiceCreateEventPayload } from '@mixan/db';
import {
  createEvent as createClickhouseEvent,
  db,
  formatClickhouseDate,
  getSalts,
} from '@mixan/db';

import { parseIp } from '../src/utils/parseIp';
import { parseUserAgent } from '../src/utils/parseUserAgent';

const clean = omit([
  'ip',
  'os',
  'ua',
  'url',
  'hash',
  'host',
  'path',
  'device',
  'screen',
  'hostname',
  'language',
  'referrer',
  'timezone',
]);
async function main() {
  const events = await db.event.findMany({
    where: {
      project_id: '4e2798cb-e255-4e9d-960d-c9ad095aabd7',
      name: 'screen_view',
      createdAt: {
        gte: new Date('2024-01-01'),
        lt: new Date('2024-02-04'),
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const grouped: Record<string, Event[]> = {};
  let index = 0;
  for (const event of events.slice()) {
    // console.log(index, event.name, event.createdAt.toISOString());
    index++;

    const properties = event.properties as Record<string, any>;

    if (properties.ua?.includes('bot')) {
      // console.log('IGNORE', event.id);
      continue;
    }

    if (!event.profile_id) {
      // console.log('IGNORE', event.id);
      continue;
    }
    const hej = grouped[event.profile_id];
    if (hej) {
      hej.push(event);
    } else {
      grouped[event.profile_id] = [event];
    }
  }

  console.log('Total users', Object.keys(grouped).length);

  let uidx = -1;
  for (const profile_id of Object.keys(grouped)) {
    uidx++;
    console.log(`User index ${uidx}`);

    const events = uniqBy(prop('createdAt'), grouped[profile_id] || []);

    if (events) {
      let lastSessionStart = null;
      let screenViews = 0;
      let totalDuration = 0;
      console.log('new user...');
      let eidx = -1;
      for (const event of events) {
        eidx++;
        const prevEvent = events[eidx - 1];
        const prevEventAt = prevEvent?.createdAt;

        const nextEvent = events[eidx + 1];

        const properties = event.properties as Record<string, any>;
        const projectId = event.project_id;
        const path = properties.path!;
        const ip = properties.ip!;
        const origin = 'https://mixan.kiddo.se';
        const ua = properties.ua!;
        const uaInfo = parseUserAgent(ua);
        const salts = await getSalts();
        const profileId = generateProfileId({
          salt: salts.current,
          origin,
          ip,
          ua,
        });

        const geo = parseIp(ip);

        const isNextEventNewSession =
          nextEvent &&
          nextEvent.createdAt.getTime() - event.createdAt.getTime() >
            1000 * 60 * 30;

        const payload: IServiceCreateEventPayload = {
          name: event.name,
          profileId,
          projectId,
          properties: clean(properties),
          createdAt: event.createdAt.toISOString(),
          country: geo.country,
          city: geo.city,
          region: geo.region,
          continent: geo.continent,
          os: uaInfo.os,
          osVersion: uaInfo.osVersion,
          browser: uaInfo.browser,
          browserVersion: uaInfo.browserVersion,
          device: uaInfo.device,
          brand: uaInfo.brand,
          model: uaInfo.model,
          duration:
            nextEvent && !isNextEventNewSession
              ? nextEvent.createdAt.getTime() - event.createdAt.getTime()
              : 0,
          path,
          referrer: properties?.referrer?.host ?? '', // TODO
          referrerName: properties?.referrer?.host ?? '', // TODO
        };

        if (!prevEventAt) {
          lastSessionStart = await createSessionStart(payload);
        } else if (
          event.createdAt.getTime() - prevEventAt.getTime() >
          1000 * 60 * 30
        ) {
          if (eidx > 0 && prevEventAt && lastSessionStart) {
            await createSessionEnd(prevEventAt, lastSessionStart, {
              screenViews,
              totalDuration,
            });
            totalDuration = 0;
            screenViews = 0;
            lastSessionStart = await createSessionStart(payload);
          }
        }

        screenViews++;
        totalDuration += payload.duration;
        await createEvent(payload);
      } // for each user event

      const prevEventAt = events[events.length - 1]?.createdAt;
      if (prevEventAt && lastSessionStart) {
        await createSessionEnd(prevEventAt, lastSessionStart, {
          screenViews,
          totalDuration,
        });
      }
    }
  }
}

async function createEvent(event: IServiceCreateEventPayload) {
  console.log(
    `Create ${event.name} - ${event.path} - ${formatClickhouseDate(
      event.createdAt
    )} - ${event.duration / 1000} sec`
  );
  await createClickhouseEvent(event);
}

async function createSessionStart(event: IServiceCreateEventPayload) {
  const session: IServiceCreateEventPayload = {
    ...event,
    duration: 0,
    name: 'session_start',
    createdAt: toISOString(getTime(event.createdAt) - 10),
  };

  await createEvent(session);
  return session;
}

async function createSessionEnd(
  prevEventAt: Date,
  sessionStart: IServiceCreateEventPayload,
  options: {
    screenViews: number;
    totalDuration: number;
  }
) {
  const properties: Record<string, unknown> = {};
  if (options.screenViews === 1) {
    properties._bounce = true;
  } else {
    properties._bounce = false;
  }

  const session: IServiceCreateEventPayload = {
    ...sessionStart,
    properties: {
      ...properties,
      ...sessionStart.properties,
    },
    duration: options.totalDuration,
    name: 'session_end',
    createdAt: toISOString(prevEventAt.getTime() + 10),
  };

  await createEvent(session);
  return session;
}

main();
