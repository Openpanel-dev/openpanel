import fs from 'node:fs';
import * as faker from '@faker-js/faker';
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
  await fetch('http://localhost:3333/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...event.headers,
    },
    body: JSON.stringify(event.track),
  });
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

// Distribute events over 6 minutes
const SIX_MINUTES_MS = 3 * 60 * 1000;
const startTime = Date.now();
let lastTriggeredIndex = 0;

async function triggerEvents(file: string) {
  const generatedEvents = require(`./${file}`);
  const currentTime = Date.now();
  const elapsedTime = currentTime - startTime;

  if (elapsedTime >= SIX_MINUTES_MS) {
    console.log('All events triggered.');
    return;
  }

  const eventsToTrigger = Math.floor(
    generatedEvents.length * (elapsedTime / SIX_MINUTES_MS),
  );

  // Send events that haven't been triggered yet
  for (let i = lastTriggeredIndex; i < eventsToTrigger; i++) {
    console.log('asbout to send');

    const event = generatedEvents[i]!;
    try {
      await trackit(event);
      console.log(`Event ${i + 1} sent successfully`);
    } catch (error) {
      console.error(`Failed to send event ${i + 1}:`, error);
    }
    console.log(
      `sending ${event.track.payload.properties.__path} from user ${event.headers['user-agent']}`,
    );
  }

  lastTriggeredIndex = eventsToTrigger;
  const remainingEvents = generatedEvents.length - lastTriggeredIndex;

  console.log(
    `Triggered ${lastTriggeredIndex} events. Remaining: ${remainingEvents}`,
  );

  if (remainingEvents > 0) {
    setTimeout(() => triggerEvents(file), 50); // Check every 50ms
  }

  console.log(`Total events to trigger: ${generatedEvents.length}`);
}

async function createMock(file: string) {
  for (const project of domains) {
    await db.project.create({
      data: {
        organizationId: 'openpanel-dev',
        organizationSlug: 'openpanel-dev',
        name: project.domain,
        clients: {
          create: {
            organizationId: 'openpanel-dev',
            organizationSlug: 'openpanel-dev',
            name: project.domain,
            secret: await hashPassword('secret'),
            id: project.clientId,
            type: ClientType.write,
            cors: project.domain,
          },
        },
      },
    });
  }

  fs.writeFileSync(
    file,
    JSON.stringify(scrambleEvents(generateEvents()), null, 2),
    'utf-8',
  );
}

async function simultaneousRequests() {
  const events = require('./api-requests.json');
  const screenView = events[0]!;
  const event = JSON.parse(JSON.stringify(events[0]));
  event.track.payload.name = 'click_button';
  delete event.track.payload.properties.__referrer;

  await trackit(event);
  await trackit(event);
  trackit(screenView);
  trackit(screenView);
  await trackit(event);
  trackit(screenView);
  trackit(event);
}

async function main() {
  const [type, file = 'mock-basic.json'] = process.argv.slice(2);

  switch (type) {
    case 'send':
      await triggerEvents(file);
      break;
    case 'sim':
      await simultaneousRequests();
      break;
    case 'mock':
      await createMock(file);
      break;
    default:
      console.log('usage: jiti mock.ts send|mock|sim [file]');
      process.exit(1);
  }
}

main();
