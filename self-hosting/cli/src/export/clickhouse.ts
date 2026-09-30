import { type ChildProcess, spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { run } from '../run';

export interface Auth {
  host?: string;
  user?: string;
  password?: string;
}

// The two ways export talks to ClickHouse: one-shot queries, and a streamed
// result that is piped to disk without buffering a whole day in memory.
export interface ClickHouse {
  query: (sql: string) => Promise<string>;
  stream: (sql: string) => { output: Readable; done: Promise<void> };
}

export interface Candidate {
  id: string;
  name: string;
  image: string;
}

const authArgs = (auth: Auth): string[] => [
  ...(auth.host ? [`--host=${auth.host}`] : []),
  ...(auth.user ? [`--user=${auth.user}`] : []),
  ...(auth.password ? [`--password=${auth.password}`] : []),
];

const finish = (child: ChildProcess, label: string): Promise<void> =>
  new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} exited with ${code}`))
    );
  });

// `prefix` is the command that reaches a clickhouse-client: either
// `docker exec -i <container> clickhouse-client` or a local binary.
export const createClient = (
  prefix: string[],
  database: string,
  auth: Auth
): ClickHouse => {
  const [binary = '', ...base] = prefix;
  // `--max_execution_time=0`: a day of events can outlast the default limit.
  const args = (sql: string) => [
    ...base,
    `--database=${database}`,
    '--max_execution_time=0',
    ...authArgs(auth),
    `--query=${sql}`,
  ];
  return {
    query: async (sql) => {
      const { code, stdout } = await run([binary, ...args(sql)]);
      if (code !== 0) {
        throw new Error(`ClickHouse query failed: ${sql.slice(0, 80)}`);
      }
      return stdout.trim();
    },
    stream: (sql) => {
      // stdin is closed on purpose: `docker exec -i` would otherwise read ours.
      const child = spawn(binary, args(sql), {
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      return {
        output: child.stdout as Readable,
        done: finish(child, 'clickhouse-client'),
      };
    },
  };
};

const listContainers = async (): Promise<Candidate[]> => {
  const { stdout } = await run([
    'docker',
    'ps',
    '--format',
    '{{.ID}}\t{{.Names}}\t{{.Image}}',
  ]);
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id = '', name = '', image = ''] = line.split('\t');
      return { id, name, image };
    });
};

const looksLikeClickHouse = ({ name, image }: Candidate) =>
  /clickhouse/i.test(image) || /clickhouse|op-ch/i.test(name);

const PROBE_SQL = (database: string) =>
  `SELECT count() FROM system.tables WHERE database = '${database}' AND name = 'events'`;

export const holdsEvents = async (
  containerId: string,
  database: string,
  auth: Auth
): Promise<boolean> => {
  const { code, stdout } = await run([
    'docker',
    'exec',
    containerId,
    'clickhouse-client',
    ...authArgs(auth),
    '--query',
    PROBE_SQL(database),
  ]);
  return code === 0 && stdout.trim() === '1';
};

export const probeAll = async (database: string, auth: Auth) => {
  const containers = await listContainers();
  return Promise.all(
    containers.map(async (container) => ({
      ...container,
      hasEvents: await holdsEvents(container.id, database, auth),
    }))
  );
};

// Container names are not portable (compose, Coolify and Dokploy all differ), so
// a candidate only counts if it really holds the events table. Name-matched
// containers are tried first, then every container, in case an image was rebranded.
export const findContainers = async (
  database: string,
  auth: Auth
): Promise<Candidate[]> => {
  const all = await listContainers();
  for (const scope of [all.filter(looksLikeClickHouse), all]) {
    const matches: Candidate[] = [];
    for (const candidate of scope) {
      if (await holdsEvents(candidate.id, database, auth)) {
        matches.push(candidate);
      }
    }
    if (matches.length > 0) {
      return matches;
    }
  }
  return [];
};

export const dockerPrefix = (containerId: string): string[] => [
  'docker',
  'exec',
  '-i',
  containerId,
  'clickhouse-client',
];
