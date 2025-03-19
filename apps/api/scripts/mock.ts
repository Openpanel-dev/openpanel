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
    properties: Record<string, string>;
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
  const sessions: {
    ip: string;
    referrer: string;
    userAgent: string;
    track: Record<string, string>[];
  }[] = [
    {
      ip: '122.168.1.101',
      referrer: 'https://www.google.com',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      track: [
        { name: 'screen_view', path: '/home' },
        { name: 'button_click', element: 'signup' },
        { name: 'screen_view', path: '/pricing' },
      ],
    },
    {
      ip: '192.168.1.101',
      referrer: 'https://www.bing.com',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      track: [{ name: 'screen_view', path: '/landing' }],
    },
    {
      ip: '192.168.1.102',
      referrer: 'https://www.google.com',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
      track: [{ name: 'screen_view', path: '/about' }],
    },
    {
      ip: '192.168.1.103',
      referrer: '',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
      track: [
        { name: 'screen_view', path: '/home' },
        { name: 'form_submit', form: 'contact' },
      ],
    },
    {
      ip: '192.168.1.104',
      referrer: '',
      userAgent:
        'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      track: [{ name: 'screen_view', path: '/products' }],
    },
    {
      ip: '203.0.113.101',
      referrer: 'https://www.facebook.com',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0',
      track: [
        { name: 'video_play', videoId: 'abc123' },
        { name: 'button_click', element: 'subscribe' },
      ],
    },
    {
      ip: '203.0.113.55',
      referrer: 'https://www.twitter.com',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
      track: [
        { name: 'screen_view', path: '/blog' },
        { name: 'scroll', depth: '50%' },
      ],
    },
    {
      ip: '198.51.100.20',
      referrer: 'https://www.linkedin.com',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.902.62 Safari/537.36 Edg/92.0.902.62',
      track: [{ name: 'button_click', element: 'download' }],
    },
    {
      ip: '198.51.100.21',
      referrer: 'https://www.google.com',
      userAgent:
        'Mozilla/5.0 (Linux; Android 10; SM-A505FN) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      track: [
        { name: 'screen_view', path: '/services' },
        { name: 'button_click', element: 'learn_more' },
      ],
    },
    {
      ip: '203.0.113.60',
      referrer: '',
      userAgent:
        'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A5341f Safari/604.1',
      track: [{ name: 'form_submit', form: 'feedback' }],
    },
    {
      ip: '208.22.132.143',
      referrer: '',
      userAgent:
        'Mozilla/5.0 (Linux; arm_64; Android 10; MAR-LX1H) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 YaBrowser/20.4.4.24.00 (alpha) SA/0 Mobile Safari/537.36',
      track: [
        { name: 'screen_view', path: '/landing' },
        { name: 'screen_view', path: '/pricing' },
        { name: 'screen_view', path: '/blog' },
        { name: 'screen_view', path: '/blog/post-1' },
        { name: 'screen_view', path: '/blog/post-2' },
        { name: 'screen_view', path: '/blog/post-3' },
        { name: 'screen_view', path: '/blog/post-4' },
      ],
    },
    {
      ip: '34.187.95.236',
      referrer: 'https://chatgpt.com',
      userAgent:
        'Mozilla/5.0 (Linux; U; Android 9; ar-eg; Redmi 7 Build/PKQ1.181021.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.141 Mobile Safari/537.36 XiaoMi/MiuiBrowser/12.8.3-gn',
      track: [
        { name: 'screen_view', path: '/blog' },
        { name: 'screen_view', path: '/blog/post-1' },
      ],
    },
  ];

  const screenView: Event = {
    headers: {
      'openpanel-client-id': 'ef38d50e-7d8e-4041-9c62-46d4c3b3bb01',
      'x-client-ip': '',
      'user-agent': '',
      origin: 'https://openpanel.dev',
    },
    track: {
      type: 'track',
      payload: {
        name: 'screen_view',
        properties: {},
      },
    },
  };

  for (const session of sessions) {
    for (const track of session.track) {
      const { name, ...properties } = track;
      screenView.track.payload.name = name ?? '';
      screenView.track.payload.properties.__referrer = session.referrer ?? '';
      if (name === 'screen_view') {
        screenView.track.payload.properties.__path =
          (screenView.headers.origin ?? '') + (properties.path ?? '');
      } else {
        screenView.track.payload.name = track.name ?? '';
        screenView.track.payload.properties = properties;
      }
      screenView.headers['x-client-ip'] = session.ip;
      screenView.headers['user-agent'] = session.userAgent;
      await trackit(screenView);
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 5000));
    }
  }
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
