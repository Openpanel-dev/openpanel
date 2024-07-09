import { randomUUID } from 'crypto';
import fs from 'fs';
import { glob } from 'glob';

import type { IClickhouseEvent } from '@openpanel/db';

const BATCH_SIZE = 8000; // Define your batch size
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

export async function loadFilesBatcher() {
  const files = await glob(['../../../../Downloads/mp-data/*.txt'], {
    root: '/',
  });

  function chunks(array: string[], size: number) {
    const results = [];
    while (array.length) {
      results.push(array.splice(0, size));
    }
    return results;
  }

  const times = [];
  const chunksArray = chunks(files, 5);
  let chunkIndex = 0;
  for (const chunk of chunksArray) {
    if (times.length > 0) {
      // Print out how much time is approximately left
      const average = times.reduce((a, b) => a + b) / times.length;
      const remaining = (chunksArray.length - chunkIndex) * average;
      console.log(`Estimated time left: ${remaining / 1000 / 60} minutes`);
    }
    console.log('Processing chunk:', chunkIndex);
    chunkIndex++;
    const d = Date.now();
    await loadFiles(chunk);
    times.push(Date.now() - d);
  }
}

async function loadFiles(files: string[] = []) {
  const data: any[] = [];
  const filesToParse = files.slice(0, 10);

  await new Promise((resolve) => {
    filesToParse.forEach((file) => {
      const readStream = fs.createReadStream(file);
      const content: any[] = [];

      readStream.on('data', (chunk) => {
        // console.log(`Received ${chunk.length} bytes of data.`);
        content.push(chunk.toString('utf-8'));
      });

      readStream.on('end', () => {
        console.log('Finished reading file:', file);
        data.push(parseFileContent(content.join('')));
        if (data.length === filesToParse.length) {
          resolve(1);
        }
      });

      readStream.on('error', (error) => {
        console.error('Error reading file:', error);
      });
    });
  });

  const events: IClickhouseEvent[] = data.flat().map((event) => {
    if (event.properties.mp_lib === 'web') {
      return {
        profile_id: event.properties.distinct_id
          ? String(event.properties.distinct_id)
          : '',
        name: event.event,
        created_at: new Date(event.properties.time * 1000).toISOString(),
        properties: stripMixpanelProperties(event.properties) as Record<
          string,
          string
        >,
        country: event.properties.country_code,
        region: event.properties.$region,
        city: event.properties.$city,
        os: event.properties.$os,
        browser: event.properties.$browser,
        browser_version: event.properties.$browser_version
          ? String(event.properties.$browser_version)
          : '',
        referrer: event.properties.$initial_referrer,
        referrer_type: event.properties.$search_engine ? 'search' : '', // FIX (IN API)
        referrer_name: event.properties.$search_engine ?? '', // FIX (IN API)
        device_id: event.properties.$device_id,
        session_id: '',
        project_id: '', // FIX (IN API)
        path: event.properties.$current_url, // FIX
        origin: '', // FIX (IN API)
        os_version: '', // FIX
        model: '',
        longitude: null,
        latitude: null,
        id: randomUUID(),
        duration: 0,
        device: '', // FIX
        brand: '',
      };
    } else {
      return {
        profile_id: event.properties.distinct_id
          ? String(event.properties.distinct_id)
          : '',
        name: event.event,
        created_at: new Date(event.properties.time * 1000).toISOString(),
        properties: stripMixpanelProperties(event.properties) as Record<
          string,
          string
        >,
        country: event.properties.country_code ?? '',
        region: event.properties.$region ?? '',
        city: event.properties.$city ?? '',
        os: event.properties.$os ?? '',
        browser: event.properties.$browser ?? '',
        browser_version: event.properties.$browser_version
          ? String(event.properties.$browser_version)
          : '',
        referrer: event.properties.$initial_referrer ?? '',
        referrer_type: event.properties.$search_engine ? 'search' : '', // FIX (IN API)
        referrer_name: event.properties.$search_engine ?? '', // FIX (IN API)
        device_id: event.properties.$device_id ?? '',
        session_id: '',
        project_id: '', // FIX (IN API)
        path: event.properties.$current_url ?? '', // FIX
        origin: '', // FIX (IN API)
        os_version: '', // FIX
        model: '',
        longitude: null,
        latitude: null,
        id: randomUUID(),
        duration: 0,
        device: '', // FIX
        brand: '',
      };
    }
  });

  const totalPages = Math.ceil(events.length / BATCH_SIZE);
  const estimatedTime = (totalPages / 8) * SLEEP_TIME + (totalPages / 8) * 80;
  console.log(`Estimated time: ${estimatedTime / 1000} seconds`);

  async function batcher(page: number) {
    const batch = events.slice(page * BATCH_SIZE, (page + 1) * BATCH_SIZE);

    if (batch.length === 0) {
      return;
    }

    // const size = Buffer.byteLength(JSON.stringify(batch));
    // console.log(batch.length, size / (1024 * 1024));

    await fetch('http://localhost:3333/import/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'openpanel-client-id': 'dd3db204-dcf6-49e2-9e82-de01cba7e585',
        'openpanel-client-secret': 'sec_293b903816e327e10c9d',
      },
      body: JSON.stringify(batch),
    });

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
        progress(
          `Sending batch ${currentPage} (${Math.round((currentPage / totalPages) * 100)}... %)`
        );
        promises.push(batcher(currentPage));
      }
      await Promise.all(promises);
    }
  }
  console.log(totalPages);

  // Trigger the batches
  try {
    await runBatchesInParallel(totalPages, 8); // Run 8 batches in parallel
  } catch (e) {
    console.log('ERROR?!', e);
  }
}

loadFilesBatcher();
