import { escape } from 'sqlstring';

import type { IClickhouseEvent } from '@openpanel/db';
import { chQuery, eventBuffer } from '@openpanel/db';
import { sessionsQueue } from '@openpanel/queue/src/queues';
import { redis } from '@openpanel/redis';

async function debugStalledEvents() {
  const keys = await redis.keys('bull:sessions:sessionEnd*');
  const delayedZRange = await redis.zrange(
    'bull:sessions:delayed',
    0,
    -1,
    'WITHSCORES'
  );
  const delayedValues = delayedZRange.reduce(
    (acc, item, index, array) => {
      if (index % 2 === 0) {
        acc[item] = Number(array[index + 1]) / 0x1000;
      }
      return acc;
    },
    [] as Record<string, number>
  );
  const opKeys = await redis.keys('op:*');
  const stalledEvents = await redis.lrange('op:buffer:events:stalled', 0, -1);
  // keys.forEach((key) => {
  //   console.log(key);
  // });
  // console.log('--------------------');

  const queue = await eventBuffer.getQueue(-1);

  queue
    .filter((item) => item.event.name === 'screen_view')
    .forEach((item) => {
      const date = new Date(item.event.created_at.replace(' ', 'T') + 'Z');
      const match = keys.find((key) => {
        return item.event.device_id && key.includes(item.event.device_id);
      });
      if (match) {
        // console.log(
        //   date.toISOString(),
        //   item.event.name,
        //   item.event.device,
        //   item.event.session_id,
        //   item.event.profile_id,
        //   item.event.device_id,
        //   match
        // );
      } else {
        console.log(
          'NO MATCH FOUND!',
          date.toISOString(),
          item.event.name,
          '[SID]',
          item.event.session_id,
          '[PID]',
          item.event.profile_id,
          '[DID]',
          item.event.device_id
        );
        console.log(item.event);
        console.log('');

        // console.log('Not in queue!');
        // log§
      }
    });

  if (stalledEvents.length > 0) {
    const res = await chQuery(
      `SELECT * FROM events WHERE id IN (${stalledEvents.map((item) => escape(JSON.parse(item).id)).join(',')})`
    );

    stalledEvents.forEach((item) => {
      const event = JSON.parse(item) as IClickhouseEvent;
      const date = new Date(event.created_at.replace(' ', 'T') + 'Z');
      console.log(
        'STALLED!',
        date.toISOString(),
        event.name,
        '[IN_DB]',
        res.find((item) => item.id === event.id) ? 'YES' : 'NO',
        '[ID]',
        event.id,
        '[SID]',
        event.session_id,
        '[PID]',
        event.profile_id,
        '[DID]',
        event.device_id
      );
      // console.log(event);
    });
  }

  console.log('OP Keys', opKeys);

  console.log('Queue', queue.length);
  console.log('Session Ends', keys.length);
  console.log('Stalled Events', stalledEvents.length);

  // keys.forEach((key) => {
  //   if (key.includes('e1b233e69bcd2132ec7bf343004d4b01')) {
  //     console.log(key);
  //   }
  // });

  const delayedJobs = await sessionsQueue.getDelayed();
  console.log('delayedJobs', delayedJobs.length);
  delayedJobs.sort((a, b) => a.timestamp + a.delay - (b.timestamp + b.delay));
  let delayedJobsCount = 0;
  delayedJobs.forEach((job) => {
    const date = new Date(delayedValues[job.id]);
    // if date is in the past
    // if (date.getTime() - 1000 * 60 * 5 < Date.now()) {
    if (date.getTime() < Date.now()) {
      delayedJobsCount++;
      console.log(
        date.toLocaleString('sv-SE'),
        'https://op.coderax.se/worker/queue/sessions/' +
          encodeURIComponent(job.id)
      );
    }
  });

  console.log('delayedJobsCount', delayedJobsCount);
}

async function main() {
  if (process.argv[2] === 'stalled') {
    await debugStalledEvents();
  }

  process.exit(0);
}

main();
