// Reads the events the testbed produced straight from ClickHouse over HTTP,
// so the spec asserts what was stored, not what the browser sent.

const DEFAULT_CLICKHOUSE_URL = 'http://localhost:8123/openpanel';
const POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 60_000;

export type StoredEvent = {
  name: string;
  path: string;
  origin: string;
  properties: Record<string, string>;
  stored_at: string;
};

function clickhouseEndpoint() {
  const url = new URL(process.env.CLICKHOUSE_URL ?? DEFAULT_CLICKHOUSE_URL);
  const database = url.pathname.replace(/^\//, '');
  const headers: Record<string, string> = {};
  if (url.username) {
    const credentials = Buffer.from(
      `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`
    ).toString('base64');
    headers.authorization = `Basic ${credentials}`;
  }
  url.username = '';
  url.password = '';
  url.pathname = '/';
  if (database) {
    url.searchParams.set('database', database);
  }
  return { url, headers };
}

export async function query<Row>(sql: string): Promise<Row[]> {
  const { url, headers } = clickhouseEndpoint();
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: `${sql} FORMAT JSONEachRow`,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ClickHouse ${response.status}: ${text}`);
  }
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Row);
}

function toClickhouseDateTime(date: Date) {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

export function eventsSince(origin: string, since: Date) {
  return query<StoredEvent>(`
    SELECT name, path, origin, properties, toString(created_at) AS stored_at
    FROM events
    WHERE origin = '${origin}'
      AND created_at >= toDateTime64('${toClickhouseDateTime(since)}', 3, 'UTC')
    ORDER BY created_at
  `);
}

// Ingest goes through Kafka, the worker and a buffer before the insert, so
// the rows arrive a few seconds after the click.
export async function waitForEvents(
  origin: string,
  since: Date,
  isComplete: (events: StoredEvent[]) => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const deadline = Date.now() + timeoutMs;
  let events: StoredEvent[] = [];
  while (Date.now() < deadline) {
    events = await eventsSince(origin, since);
    if (isComplete(events)) {
      return events;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  const seen = events.map((event) => `${event.name} ${event.path}`);
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for events in ClickHouse. Stored so far: ${JSON.stringify(seen)}`
  );
}
