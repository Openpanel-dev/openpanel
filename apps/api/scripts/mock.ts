import fs from 'node:fs';
import * as faker from '@faker-js/faker';
import { generateId } from '@openpanel/common';
import { hashPassword } from '@openpanel/common/server';
import { ClientType, db } from '@openpanel/db';
import { v4 as uuidv4 } from 'uuid';

const DOMAIN_COUNT = 5;
const PROFILE_COUNT = 50;

interface Event {
  track: Track;
  headers: Record<string, string>;
}

interface Track {
  type: 'track';
  payload: {
    name: string;
    properties: {
      __referrer: string;
      __path: string;
      __title: string;
    };
  };
}

interface Profile {
  id?: string;
  name?: string;
  userAgent: string;
  ip: string;
}

const domains = Array.from({ length: DOMAIN_COUNT }, () => ({
  domain: `https://${faker.allFakers.en.internet.domainName()}`,
  clientId: uuidv4(),
  profiles: Array.from({ length: PROFILE_COUNT }, () => ({
    // id: uuidv4(),
    // name: faker.allFakers.en.name.findName(),
    userAgent: faker.allFakers.en.internet.userAgent(),
    ip: faker.allFakers.en.internet.ipv4(),
  })),
}));

const referrers = [
  '',
  'https://www.google.com',
  'https://www.facebook.com',
  'https://www.twitter.com',
  'https://www.linkedin.com',
  'https://www.bing.com',
  'https://www.duckduckgo.com',
  'https://www.baidu.com',
  'https://www.yandex.com',
  'https://www.pinterest.com',
  'https://www.reddit.com',
  'https://www.tumblr.com',
  'https://www.flickr.com',
  'https://www.vimeo.com',
  'https://www.mixcloud.com',
  '',
];

function generatePath(): string {
  const basePath = `/${faker.allFakers.en.lorem.slug()}`;
  const queryString =
    Math.random() < 0.7
      ? `?${faker.allFakers.en.internet.domainWord()}=${faker.allFakers.en.lorem.word()}`
      : '';
  const hashFragment =
    Math.random() < 0.3 ? `#${faker.allFakers.en.lorem.word()}` : '';
  return `${basePath}${queryString}${hashFragment}`;
}

async function trackit(event: Event) {
  console.log('trackit', JSON.stringify(event.track, null, 2));
  const res = await fetch('http://localhost:3333/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...event.headers,
    },
    body: JSON.stringify(event.track),
  });

  if (res.ok) {
    return true;
  }

  console.error('Failed to track event', res.status, res.statusText);
  return false;
}

function generateScreenViews({
  domain,
  clientId,
  profile,
  eventsCount,
}: {
  domain: string;
  clientId: string;
  profile: Profile;
  eventsCount: number;
}): Event[] {
  return Array.from({ length: eventsCount }, (_, index) => ({
    headers: {
      'openpanel-client-id': clientId,
      'x-client-ip': profile.ip,
      'user-agent': profile.userAgent,
      origin: domain,
    },
    track: {
      type: 'track',
      payload: {
        name: 'screen_view',
        properties: {
          __referrer:
            referrers[Math.floor(Math.random() * referrers.length)] ?? '',
          __path: `${domain}${generatePath()}`,
          __title: faker.allFakers.en.lorem.sentence(),
        },
      },
    },
  }));
}

function generateEvents(): Event[] {
  const events: Event[] = [];

  domains.forEach(({ domain, clientId, profiles }) => {
    for (let i = 0; i < profiles.length; i++) {
      events.push(
        ...generateScreenViews({
          domain,
          clientId,
          profile: profiles[i % PROFILE_COUNT]!,
          eventsCount: Math.floor(Math.random() * 10),
        }),
      );
    }
  });

  return events;
}

function scrambleEvents(events: Event[]) {
  return events.sort(() => Math.random() - 0.5);
}

let lastTriggeredIndex = 0;

async function triggerEvents(generatedEvents: any[]) {
  const EVENTS_PER_SECOND = Number.parseInt(
    process.env.EVENTS_PER_SECOND || '100',
    10,
  );
  const INTERVAL_MS = 1000 / EVENTS_PER_SECOND;

  if (lastTriggeredIndex >= generatedEvents.length) {
    console.log('All events triggered.');
    return;
  }

  const event = generatedEvents[lastTriggeredIndex]!;
  try {
    await trackit(event);
    console.log(`Event ${lastTriggeredIndex + 1} sent successfully`);
    console.log(
      `sending ${event.track.payload?.properties?.__path} from user ${event.headers['user-agent']}`,
    );
  } catch (error) {
    console.error(`Failed to send event ${lastTriggeredIndex + 1}:`, error);
  }

  lastTriggeredIndex++;
  const remainingEvents = generatedEvents.length - lastTriggeredIndex;

  console.log(
    `Triggered ${lastTriggeredIndex} events. Remaining: ${remainingEvents}`,
  );

  if (remainingEvents > 0) {
    return new Promise((resolve) => {
      setTimeout(() => {
        triggerEvents(generatedEvents);
        resolve(null);
      }, INTERVAL_MS);
    });
  }

  console.log('All events triggered.');
  console.log(`Total events to trigger: ${generatedEvents.length}`);
}

async function createMock(file: string) {
  for (const project of domains) {
    await db.project.create({
      data: {
        organizationId: 'openpanel-dev',
        name: project.domain,
        cors: [project.domain],
        domain: project.domain,
        crossDomain: true,
        clients: {
          create: {
            organizationId: 'openpanel-dev',
            name: project.domain,
            secret: await hashPassword('secret'),
            id: project.clientId,
            type: ClientType.write,
          },
        },
      },
    });
  }

  fs.writeFileSync(
    file,
    JSON.stringify(insertFakeEvents(scrambleEvents(generateEvents())), null, 2),
    'utf-8',
  );
}

function insertFakeEvents(events: Event[]) {
  const blueprint = {
    headers: {
      'openpanel-client-id': '5b679c47-9ec0-470a-8944-a9ab8f42b14f',
      'x-client-ip': '229.145.77.175',
      'user-agent':
        'Opera/13.66 (Macintosh; Intel Mac OS X 10.8.3 U; GV Presto/2.9.183 Version/11.00)',
      origin: 'https://classic-hovel.info',
    },
    track: {
      type: 'track',
      payload: {
        name: 'screen_view',
        properties: {
          __referrer: 'https://www.google.com',
          __path: 'https://classic-hovel.info/beneficium-arcesso-quisquam',
          __title: 'Hic thesis laboriosam copiose admoveo sufficio.',
        },
      },
    },
  };
  const newEvents = [];
  for (const event of events) {
    (event.track.payload.properties as any).__group = generateId();
    newEvents.push(event);

    if (event.track.payload.name === 'screen_view' && Math.random() < 0.5) {
      const fakeEvent = JSON.parse(JSON.stringify(blueprint));
      fakeEvent.track.payload.name = faker.allFakers.en.lorem.word();
      fakeEvent.headers = event.headers;
      delete fakeEvent.track.payload.properties;
      newEvents.push(fakeEvent);
      fakeEvent.track.payload.properties = {
        __group: (event.track.payload.properties as any).__group,
      };
    }
  }

  return newEvents;
}

async function simultaneousRequests() {
  const events = require('./mock-basic.json');
  const screenView = events[0]!;
  const event = JSON.parse(JSON.stringify(events[0]));
  event.track.payload.name = 'click_button';
  delete event.track.payload.properties.__referrer;

  await Promise.all([
    trackit(event),
    trackit({
      ...event,
      track: {
        ...event.track,
        payload: {
          ...event.track.payload,
          name: 'text',
        },
      },
    }),
  ]);
}
const exit = async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  process.exit(1);
};

async function main() {
  const [type, file = 'mock-basic.json'] = process.argv.slice(2);

  switch (type) {
    case 'send':
      await triggerEvents(require(`./${file}`));
      break;
    case 'sim':
      await simultaneousRequests();
      break;
    case 'mock':
      await createMock(file);
      await exit();
      break;
    default:
      console.log('usage: jiti mock.ts send|mock|sim [file]');
  }
}

main();
