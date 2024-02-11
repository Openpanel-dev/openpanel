// @ts-nocheck

import { createEvent } from '@/services/event.service';
import { last, omit } from 'ramda';

import type { Event } from '../src/prisma-client';
import { db } from '../src/prisma-client';

async function push(event: Event) {
  if (event.properties.ip && Number.isNaN(parseInt(event.properties.ip[0]))) {
    return console.log('IGNORE', event.id);
  }
  await fetch('http://localhost:3030/api/event', {
    method: 'POST',
    body: JSON.stringify({
      name: event.name,
      timestamp: event.createdAt.toISOString(),
      path: event.properties.path,
      properties: omit(
        [
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
        ],
        event.properties
      ),
      referrer: event.properties?.referrer?.host ?? undefined,
    }),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': event.properties.ua,
      'X-Forwarded-For': event.properties.ip,
      'mixan-client-id': 'c8b4962e-bc3d-4b23-8ea4-505c8fbdf09e',
      origin: 'https://mixan.kiddo.se',
    },
  }).catch(() => {});
}

async function main() {
  const events = await db.event.findMany({
    where: {
      project_id: '4e2798cb-e255-4e9d-960d-c9ad095aabd7',
      name: 'screen_view',
      createdAt: {
        gte: new Date('2024-01-14'),
        lt: new Date('2024-01-18'),
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const grouped: Record<string, Event[]> = {};
  let index = 0;
  for (const event of events.slice()) {
    console.log(index, event.name, event.createdAt.toISOString());
    index++;

    if (event.properties.ua?.includes('bot')) {
      console.log('IGNORE', event.id);
      continue;
    }

    if (grouped[event.profile_id]) {
      grouped[event.profile_id].push(event);
    } else {
      grouped[event.profile_id] = [event];
    }
  }

  for (const profile_id of Object.keys(grouped).slice(0, 10)) {
    const events = grouped[profile_id];

    if (events) {
      console.log('new user...');
      let eidx = -1;
      for (const event of events) {
        eidx++;
        const lastEventAt = events[eidx - 1]?.createdAt;

        const profileId: string | null = null;
        const projectId = event.project_id;
        const path = event.properties.path as string;
        const ip = event.properties.ip as string;
        const origin = 'https://mixan.kiddo.se';
        const ua = event.properties.ua as string;
        const uaInfo = parseUserAgent(ua);
        const salts = await getSalts();
        const currentProfileId = generateProfileId({
          salt: salts.current,
          origin,
          ip,
          ua,
        });
        const previousProfileId = generateProfileId({
          salt: salts.previous,
          origin,
          ip,
          ua,
        });

        const [geo, eventsJobs] = Promise.all([
          parseIp(ip),
          eventsQueue.getJobs(['delayed']),
        ]);
        const payload: IServiceCreateEventPayload = {
          name: body.name,
          profileId,
          projectId,
          properties: body.properties,
          createdAt: body.timestamp,
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
          duration: 0,
          path,
          referrer: body.referrer, // TODO
          referrerName: body.referrer, // TODO
        };

        if (!lastEventAt) {
          createEvent({});
          continue;
        }

        if (
          event.createdAt.getTime() - lastEventAt.getTime() >
          1000 * 60 * 30
        ) {
          console.log(
            'new Session?',
            event.createdAt.toISOString(),
            event.properties.path
          );
        } else {
          console.log('Same session?');
        }
      }
    }
  }
}

main();
