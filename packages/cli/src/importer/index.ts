import fs from 'fs';
import path from 'path';
import arg from 'arg';
import { groupBy } from 'ramda';

import type { PostEventPayload } from '@openpanel/sdk';

const BATCH_SIZE = 10000; // Define your batch size
const SLEEP_TIME = 100; // Define your sleep time between batches

function progress(value: string) {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  process.stdout.write(value);
}

function stripMixpanelProperties(obj: Record<string, unknown>) {
  const properties = ['time', 'distinct_id'];
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (key.match(/^(\$|mp_)/) || properties.includes(key)) {
      continue;
    }
    result[key] = obj[key];
  }
  return result;
}

function safeParse(json: string) {
  try {
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

function parseFileContent(fileContent: string): {
  event: string;
  properties: {
    time: number;
    distinct_id?: string | number;
    [key: string]: unknown;
  };
}[] {
  try {
    return JSON.parse(fileContent);
  } catch (error) {
    const lines = fileContent.trim().split('\n');
    return lines
      .map((line, index) => {
        const json = safeParse(line);
        if (!json) {
          console.log('Warning: Failed to parse JSON');
          console.log('Index:', index);
          console.log('Line:', line);
        }
        return json;
      })
      .filter(Boolean);
  }
}

export default function importer() {
  const args = arg(
    {
      '--file': String,
    },
    {
      permissive: true,
    }
  );

  if (!args['--file']) {
    throw new Error('Missing --file argument');
  }

  const cwd = process.cwd();

  const filePath = path.resolve(cwd, args['--file']);
  const fileContent = parseFileContent(fs.readFileSync(filePath, 'utf-8'));

  // const groups = groupBy((event) => event.properties.$device_id, fileContent);
  // const groupEntries = Object.entries(groups);

  // const profiles = new Map<string, any[]>();

  // for (const [deviceId, items] of Object.entries(groups)) {
  //   items.forEach((item) => {
  //     if (item.properties.distinct_id) {
  //       if (!profiles.has(item.properties.distinct_id)) {
  //         profiles.set(item.properties.distinct_id, []);
  //       }
  //       profiles.get(item.properties.distinct_id)!.push(item);
  //     } else {
  //       item.properties.$device_id
  //     }
  //   })
  //   profiles.
  // }
  // console.log('Total:', groupEntries.length);
  // console.log('Undefined:', groups.undefined?.length ?? 0);

  // const uniqueKeys = new Set<string>();
  // groups.undefined.forEach((event) => {
  //   if (event.properties.distinct_id) {
  //     console.log(event);
  //   }
  // });

  // 1: group by device id
  // 2: add session start, session end and populate session_id
  // 3: check if distinct_id exists on any event
  //    - If it does, get all events with that distinct_id and NO device_id and within session_start and session_end
  //    - add add the session_id to those events
  // 4: send all events to the server

  const events: PostEventPayload[] = fileContent
    .slice()
    .reverse()
    .map((event) => {
      if (event.properties.mp_lib === 'web') {
        console.log(event);
      }
      return {
        profileId: event.properties.distinct_id
          ? String(event.properties.distinct_id)
          : undefined,
        name: event.event,
        timestamp: new Date(event.properties.time * 1000).toISOString(),
        properties: {
          __country: event.properties.country_code,
          __region: event.properties.$region,
          __city: event.properties.$city,
          __os: event.properties.$os,
          __browser: event.properties.$browser,
          __browser_version: event.properties.$browser_version,
          __referrer: event.properties.$referrer,
          __device_id: event.properties.$device_id,
        },
      };
    });

  const totalPages = Math.ceil(events.length / BATCH_SIZE);
  const estimatedTime = (totalPages / 8) * SLEEP_TIME + (totalPages / 8) * 80;
  console.log(`Estimated time: ${estimatedTime / 1000} seconds`);

  async function batcher(page: number) {
    const batch = events.slice(page * BATCH_SIZE, (page + 1) * BATCH_SIZE);

    if (batch.length === 0) {
      return;
    }

    const size = Buffer.byteLength(JSON.stringify(batch));
    console.log(batch.length, size / (1024 * 1024));

    // await fetch('http://localhost:3333/import/events', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'openpanel-client-id': 'dd3db204-dcf6-49e2-9e82-de01cba7e585',
    //     'openpanel-client-secret': 'sec_293b903816e327e10c9d',
    //   },
    //   body: JSON.stringify(batch),
    // });

    await new Promise((resolve) => setTimeout(resolve, SLEEP_TIME));
  }

  async function runBatchesInParallel(
    totalPages: number,
    concurrentBatches: number
  ) {
    let currentPage = 0;

    while (currentPage < totalPages) {
      const promises = [];
      for (
        let i = 0;
        i < concurrentBatches && currentPage < totalPages;
        i++, currentPage++
      ) {
        console.log(`Sending batch ${currentPage}... %)`);
        promises.push(batcher(currentPage));
      }
      await Promise.all(promises);
    }
  }
  console.log(totalPages);

  // Trigger the batches
  try {
    runBatchesInParallel(totalPages, 8); // Run 8 batches in parallel
  } catch (e) {
    console.log('ERROR?!', e);
  }

  return null;
}
