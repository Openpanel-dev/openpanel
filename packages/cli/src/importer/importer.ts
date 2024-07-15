import { randomUUID } from 'crypto';
import fs from 'fs';
import { glob } from 'glob';
import { assocPath, clone, prop, uniqBy } from 'ramda';

import type { IClickhouseEvent } from '@openpanel/db';

import { parsePath } from './copy.url';

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

interface Session {
  start: number; // Timestamp of the session start
  end: number; // Timestamp of the session end
  profileId?: string;
  deviceId?: string;
  sessionId: string;
  firstEvent?: IClickhouseEvent;
  lastEvent?: IClickhouseEvent;
  events: IClickhouseEvent[];
}

function generateSessionEvents(events: IClickhouseEvent[]): Session[] {
  let sessionList: Session[] = [];
  const lastSessionByDevice: Record<string, Session> = {};
  const lastSessionByProfile: Record<string, Session> = {};
  const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds

  events.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const event of events) {
    const eventTime = new Date(event.created_at).getTime();
    let deviceSession = event.device_id
      ? lastSessionByDevice[event.device_id]
      : undefined;
    let profileSession = event.profile_id
      ? lastSessionByProfile[event.profile_id]
      : undefined;

    // Check if new session is needed for deviceId
    if (
      event.device_id &&
      event.device_id !== event.profile_id &&
      (!deviceSession || eventTime > deviceSession.end + thirtyMinutes)
    ) {
      deviceSession = {
        start: eventTime,
        end: eventTime,
        deviceId: event.device_id,
        sessionId: generateSessionId(),
        firstEvent: event,
        events: [event],
      };
      lastSessionByDevice[event.device_id] = deviceSession;
      sessionList.push(deviceSession);
    } else if (deviceSession) {
      deviceSession.end = eventTime;
      deviceSession.lastEvent = event;
      deviceSession.events.push(event);
    }

    // Check if new session is needed for profileId
    if (
      event.profile_id &&
      event.device_id !== event.profile_id &&
      (!profileSession || eventTime > profileSession.end + thirtyMinutes)
    ) {
      profileSession = {
        start: eventTime,
        end: eventTime,
        profileId: event.profile_id,
        sessionId: generateSessionId(),
        firstEvent: event,
        events: [event],
      };
      lastSessionByProfile[event.profile_id] = profileSession;
      sessionList.push(profileSession);
    } else if (profileSession) {
      profileSession.end = eventTime;
      profileSession.lastEvent = event;
      profileSession.events.push(event);
    }

    // Sync device and profile sessions if both exist
    // if (
    //   deviceSession &&
    //   profileSession &&
    //   deviceSession.sessionId !== profileSession.sessionId
    // ) {
    //   profileSession.sessionId = deviceSession.sessionId;
    // }

    if (
      deviceSession &&
      profileSession &&
      deviceSession.sessionId !== profileSession.sessionId
    ) {
      // Merge sessions by ensuring they reference the same object
      const unifiedSession = {
        ...deviceSession,
        ...profileSession,
        events: [...deviceSession.events, ...profileSession.events],
        start: Math.min(deviceSession.start, profileSession.start),
        end: Math.max(deviceSession.end, profileSession.end),
        sessionId: deviceSession.sessionId, // Prefer the deviceSession ID for no particular reason
      };
      lastSessionByDevice[event.device_id] = unifiedSession;
      lastSessionByProfile[event.profile_id] = unifiedSession;
      // filter previous before appending new unified fileter
      sessionList = sessionList.filter(
        (session) =>
          session.sessionId !== deviceSession?.sessionId &&
          session.sessionId !== profileSession?.sessionId
      );
      sessionList.push(unifiedSession);
    }
  }

  return sessionList;
}

function generateSessionId(): string {
  return randomUUID();
}

async function loadFiles(files: string[] = []) {
  const data: any[] = [];
  const filesToParse = files.slice(0, 10);

  await new Promise((resolve) => {
    filesToParse.forEach((file) => {
      const readStream = fs.createReadStream(file);
      const content: any[] = [];

      readStream.on('data', (chunk) => {
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

  // sorted oldest to latest
  const a = data
    .flat()
    .sort((a, b) => a.properties.time - b.properties.time)
    .map((event) => {
      const currentUrl = event.properties.$current_url;
      if (currentUrl) {
        // console.log('');
        // console.log(event.properties);
        // console.log('');
      }
      const url = parsePath(currentUrl);
      const eventToSave = {
        profile_id: event.properties.distinct_id
          ? String(event.properties.distinct_id).replace(/^\$device:/, '')
          : event.properties.$device_id ?? '',
        name: event.event,
        created_at: new Date(event.properties.time * 1000).toISOString(),
        properties: {
          ...(stripMixpanelProperties(event.properties) as Record<
            string,
            string
          >),
          ...(currentUrl
            ? {
                __query: url.query,
                __hash: url.hash,
              }
            : {}),
        },
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
        path: url.path,
        origin: url.origin,
        os_version: '', // FIX
        model: '',
        longitude: null,
        latitude: null,
        id: randomUUID(),
        duration: 0,
        device: currentUrl ? '' : 'server',
        brand: '',
      };
      return eventToSave;
    });

  const sessions = generateSessionEvents(a);

  const events = sessions.flatMap((session) => {
    return [
      session.firstEvent && {
        ...session.firstEvent,
        id: randomUUID(),
        created_at: new Date(
          new Date(session.firstEvent.created_at).getTime() - 1000
        ).toISOString(),
        session_id: session.sessionId,
        name: 'session_start',
      },
      ...uniqBy(
        prop('id'),
        session.events.map((event) =>
          assocPath(['session_id'], session.sessionId, clone(event))
        )
      ),
      session.lastEvent && {
        ...session.lastEvent,
        id: randomUUID(),
        created_at: new Date(
          new Date(session.lastEvent.created_at).getTime() + 1000
        ).toISOString(),
        session_id: session.sessionId,
        name: 'session_end',
      },
    ].filter(Boolean);
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

  // Trigger the batches
  try {
    await runBatchesInParallel(totalPages, 8); // Run 8 batches in parallel
  } catch (e) {
    console.log('ERROR?!', e);
  }
}

export async function importFiles(matcher: string) {
  const files = await glob([matcher], {
    root: '/',
  });

  if (files.length === 0) {
    console.log('No files found');
    return;
  }

  function chunks(array: string[], size: number) {
    const results = [];
    while (array.length) {
      results.push(array.splice(0, size));
    }
    return results;
  }

  const times = [];
  const chunksArray = chunks(files, 3);
  let chunkIndex = 0;
  for (const chunk of chunksArray) {
    if (times.length > 0) {
      // Print out how much time is approximately left
      const average = times.reduce((a, b) => a + b) / times.length;
      const remaining = (chunksArray.length - chunkIndex) * average;
      console.log(`\n\nEstimated time left: ${remaining / 1000 / 60} minutes`);
    }
    console.log('Processing chunk:', chunkIndex);
    chunkIndex++;
    const d = Date.now();
    await loadFiles(chunk);
    times.push(Date.now() - d);
  }
}
