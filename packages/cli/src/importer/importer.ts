import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';
import Progress from 'progress';
import { assocPath, prop, uniqBy } from 'ramda';

import { isSameDomain, parsePath } from '@openpanel/common';
import type { IImportedEvent } from '@openpanel/db';

const BATCH_SIZE = 30_000;
const SLEEP_TIME = 20;
const MAX_CONCURRENT_REQUESTS = 8;

type IMixpanelEvent = {
  event: string;
  properties: {
    [key: string]: unknown;
    time: number;
    $current_url?: string;
    distinct_id?: string;
    $device_id?: string;
    country_code?: string;
    $region?: string;
    $city?: string;
    $os?: string;
    $browser?: string;
    $browser_version?: string;
    $initial_referrer?: string;
    $search_engine?: string;
  };
};

function stripMixpanelProperties(obj: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([key]) =>
        !key.match(/^(\$|mp_)/) && !['time', 'distinct_id'].includes(key)
    )
  );
}

async function* parseJsonStream(
  fileStream: fs.ReadStream
): AsyncGenerator<any, void, unknown> {
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let buffer = '';
  let bracketCount = 0;

  for await (const line of rl) {
    buffer += line;
    bracketCount +=
      (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

    if (bracketCount === 0 && buffer.trim()) {
      try {
        const json = JSON.parse(buffer);
        yield json;
      } catch (error) {
        console.log('Warning: Failed to parse JSON');
        console.log('Buffer:', buffer);
      }
      buffer = '';
    }
  }

  if (buffer.trim()) {
    try {
      const json = JSON.parse(buffer);
      yield json;
    } catch (error) {
      console.log('Warning: Failed to parse remaining JSON');
      console.log('Buffer:', buffer);
    }
  }
}

interface Session {
  start: number;
  end: number;
  profileId?: string;
  deviceId?: string;
  sessionId: string;
  firstEvent?: IImportedEvent;
  lastEvent?: IImportedEvent;
  events: IImportedEvent[];
}

function generateSessionEvents(events: IImportedEvent[]): Session[] {
  let sessionList: Session[] = [];
  const lastSessionByDevice: Record<string, Session> = {};
  const lastSessionByProfile: Record<string, Session> = {};
  const thirtyMinutes = 30 * 60 * 1000;

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

    if (
      event.device_id &&
      event.device_id !== event.profile_id &&
      (!deviceSession || eventTime > deviceSession.end + thirtyMinutes)
    ) {
      deviceSession = {
        start: eventTime,
        end: eventTime,
        deviceId: event.device_id,
        sessionId: randomUUID(),
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

    if (
      event.profile_id &&
      event.device_id !== event.profile_id &&
      (!profileSession || eventTime > profileSession.end + thirtyMinutes)
    ) {
      profileSession = {
        start: eventTime,
        end: eventTime,
        profileId: event.profile_id,
        sessionId: randomUUID(),
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

    if (
      deviceSession &&
      profileSession &&
      deviceSession.sessionId !== profileSession.sessionId
    ) {
      const unifiedSession = {
        ...deviceSession,
        ...profileSession,
        events: [...deviceSession.events, ...profileSession.events],
        start: Math.min(deviceSession.start, profileSession.start),
        end: Math.max(deviceSession.end, profileSession.end),
        sessionId: deviceSession.sessionId,
      };
      lastSessionByDevice[event.device_id] = unifiedSession;
      lastSessionByProfile[event.profile_id] = unifiedSession;
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

function createEventObject(event: IMixpanelEvent): IImportedEvent {
  const getReferrer = (referrer: string | undefined) => {
    if (!referrer) {
      return '';
    }

    if (referrer === '$direct') {
      return '';
    }

    if (isSameDomain(referrer, event.properties.$current_url)) {
      return '';
    }

    return referrer;
  };
  const url = parsePath(event.properties.$current_url);
  return {
    profile_id: event.properties.distinct_id
      ? String(event.properties.distinct_id).replace(/^\$device:/, '')
      : event.properties.$device_id ?? '',
    name: event.event,
    created_at: new Date(event.properties.time * 1000).toISOString(),
    properties: {
      ...stripMixpanelProperties(event.properties),
      ...(event.properties.$current_url
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
    referrer: getReferrer(event.properties.$initial_referrer),
    referrer_type: event.properties.$search_engine ? 'search' : '',
    referrer_name: event.properties.$search_engine ?? '',
    device_id: event.properties.$device_id ?? '',
    session_id: '',
    project_id: '',
    path: url.path,
    origin: url.origin,
    os_version: '',
    model: '',
    longitude: null,
    latitude: null,
    id: randomUUID(),
    duration: 0,
    device: event.properties.$current_url ? '' : 'server',
    brand: '',
  };
}

function isMixpanelEvent(event: any): event is IMixpanelEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    typeof event?.event === 'string' &&
    typeof event?.properties === 'object' &&
    event?.properties !== null &&
    typeof event?.properties.time === 'number'
  );
}

async function processFile(file: string): Promise<IImportedEvent[]> {
  const fileStream = fs.createReadStream(file);
  const events: IImportedEvent[] = [];
  for await (const event of parseJsonStream(fileStream)) {
    if (Array.isArray(event)) {
      for (const item of event) {
        if (isMixpanelEvent(item)) {
          events.push(createEventObject(item));
        } else {
          console.log('Not a Mixpanel event', item);
        }
      }
    } else {
      if (isMixpanelEvent(event)) {
        events.push(createEventObject(event));
      } else {
        console.log('Not a Mixpanel event', event);
      }
    }
  }
  return events;
}

function processEvents(events: IImportedEvent[]): IImportedEvent[] {
  const sessions = generateSessionEvents(events);
  const processedEvents = sessions.flatMap((session) =>
    [
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
          assocPath(['session_id'], session.sessionId, event)
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
    ].filter((item): item is IImportedEvent => !!item)
  );

  return [
    ...processedEvents,
    ...events.filter((event) => {
      return !event.profile_id && !event.device_id;
    }),
  ];
}

async function sendBatchToAPI(
  batch: IImportedEvent[],
  {
    apiUrl,
    clientId,
    clientSecret,
  }: {
    apiUrl: string;
    clientId: string;
    clientSecret: string;
  }
) {
  async function request() {
    const res = await fetch(`${apiUrl}/import/events`, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'gzip',
        'Content-Type': 'application/json',
        'openpanel-client-id': clientId,
        'openpanel-client-secret': clientSecret,
      },
      body: zlib.gzipSync(JSON.stringify(batch)),
    });
    if (!res.ok) {
      throw new Error(`Failed to send batch: ${await res.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, SLEEP_TIME));
  }

  try {
    await request();
  } catch (e) {
    console.log('Error sending batch, retrying...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await request();
    } catch (e) {
      console.log('Error sending batch, skipping...');
      fs.writeFileSync(
        path.join(
          os.tmpdir(),
          `openpanel/failed-import-batch-${batch[0]?.created_at ? new Date(batch[0]?.created_at).toISOString() : Date.now()}.json`
        ),
        JSON.stringify(batch, null, 2)
      );
    }
  }
}

async function processFiles({
  files,
  apiUrl,
  clientId,
  clientSecret,
}: {
  files: string[];
  apiUrl: string;
  clientId: string;
  clientSecret: string;
}) {
  const progress = new Progress(
    'Processing (:current/:total) :file [:bar] :percent | :savedEvents saved events | :status',
    {
      total: files.length,
      width: 20,
    }
  );
  let savedEvents = 0;
  let currentBatch: IImportedEvent[] = [];
  let apiBatching = [];

  for (const file of files) {
    progress.tick({
      file,
      savedEvents,
      status: 'reading file',
    });
    const events = await processFile(file);
    progress.render({
      file,
      savedEvents,
      status: 'processing events',
    });
    const processedEvents = processEvents(events);
    for (const event of processedEvents) {
      currentBatch.push(event);
      if (currentBatch.length >= BATCH_SIZE) {
        apiBatching.push(currentBatch);
        savedEvents += currentBatch.length;
        progress.render({ file, savedEvents, status: 'saving events' });
        currentBatch = [];
      }

      if (apiBatching.length >= MAX_CONCURRENT_REQUESTS) {
        await Promise.all(
          apiBatching.map((batch) =>
            sendBatchToAPI(batch, {
              apiUrl,
              clientId,
              clientSecret,
            })
          )
        );
        apiBatching = [];
      }
    }
  }

  if (currentBatch.length > 0) {
    await sendBatchToAPI(currentBatch, {
      apiUrl,
      clientId,
      clientSecret,
    });
    savedEvents += currentBatch.length;
    progress.render({ file: 'Complete', savedEvents, status: 'Complete' });
  }
}

export async function importFiles({
  files,
  apiUrl,
  clientId,
  clientSecret,
}: {
  files: string[];
  apiUrl: string;
  clientId: string;
  clientSecret: string;
}) {
  if (files.length === 0) {
    console.log('No files found');
    return;
  }

  console.log(`Found ${files.length} files to process`);

  const startTime = Date.now();
  await processFiles({
    files,
    apiUrl,
    clientId,
    clientSecret,
  });
  const endTime = Date.now();

  console.log(
    `\nProcessing completed in ${(endTime - startTime) / 1000} seconds`
  );
}
