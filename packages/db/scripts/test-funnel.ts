import { createEvent } from '../src/services/event.service';

function c(name: string, createdAt: Date, session_id: string) {
  return createEvent({
    name,
    deviceId: '',
    profileId: '',
    projectId: '',
    sessionId: session_id,
    properties: {},
    createdAt,
    country: '',
    city: '',
    region: '',
    continent: '',
    os: '',
    osVersion: '',
    browser: '',
    browserVersion: '',
    device: '',
    brand: '',
    model: '',
    duration: 0,
    path: '/',
    referrer: '',
    referrerName: '',
    referrerType: '',
    profile: undefined,
    meta: undefined,
  });
}

async function main() {
  // Level 5
  const s = Math.random().toString(36).substring(7);
  await c('session_start', new Date('2024-02-24 10:10:00'), s);

  // // Level 2
  // s = 's2';
  // await c('session_start', new Date('2024-02-24 10:10:00'), '');
  // await c('a', new Date('2024-02-24 10:10:00'), s);
  // await c('b', new Date('2024-02-24 10:10:02'), s);

  // // Level 5
  // s = 's3';
  // await c('session_start', new Date('2024-02-24 10:10:00'), '');
  // await c('a', new Date('2024-02-24 10:10:00'), s);
  // await c('b', new Date('2024-02-24 10:10:02'), s);
  // await c('c', new Date('2024-02-24 10:10:03'), s);
  // await c('d', new Date('2024-02-24 10:10:04'), s);
  // await c('f', new Date('2024-02-24 10:10:10'), s);

  // // Level 4
  // s = 's4';
  // await c('session_start', new Date('2024-02-24 10:10:00'), '');
  // await c('a', new Date('2024-02-24 10:10:00'), s);
  // await c('b', new Date('2024-02-24 10:10:02'), s);
  // await c('c', new Date('2024-02-24 10:10:03'), s);
  // await c('d', new Date('2024-02-24 10:10:04'), s);

  // // Level 3
  // s = 's5';
  // await c('session_start', new Date('2024-02-24 10:10:00'), '');
  // await c('a', new Date('2024-02-24 10:10:00'), s);
  // await c('b', new Date('2024-02-24 10:10:02'), s);
  // await c('c', new Date('2024-02-24 10:10:03'), s);

  // // Level 3
  // s = 's6';
  // await c('session_start', new Date('2024-02-24 10:10:00'), '');
  // await c('a', new Date('2024-02-24 10:10:00'), s);
  // await c('b', new Date('2024-02-24 10:10:02'), s);
  // await c('c', new Date('2024-02-24 10:10:03'), s);

  // // Level 2
  // s = 's7';
  // await c('session_start', new Date('2024-02-24 10:10:00'), '');
  // await c('a', new Date('2024-02-24 10:10:00'), s);
  // await c('b', new Date('2024-02-24 10:10:02'), s);

  // // Level 5
  // s = 's8';
  // await c('session_start', new Date('2024-02-24 10:10:00'), '');
  // await c('a', new Date('2024-02-24 10:10:00'), s);
  // await c('b', new Date('2024-02-24 10:10:02'), s);
  // await c('c', new Date('2024-02-24 10:10:03'), s);
  // await c('d', new Date('2024-02-24 10:10:04'), s);
  // await c('f', new Date('2024-02-24 10:10:10'), s);

  // // Level 4
  // s = 's9';
  // await c('session_start', new Date('2024-02-24 10:10:00'), '');
  // await c('a', new Date('2024-02-24 10:10:00'), s);
  // await c('b', new Date('2024-02-24 10:10:02'), s);
  // await c('c', new Date('2024-02-24 10:10:03'), s);
  // await c('d', new Date('2024-02-24 10:10:04'), s);

  process.exit();
}

main();
