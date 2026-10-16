// `bun run send` — send real requests to a worktree's API with the seeded clients:
// one event, an identify, or a whole generated journey replayed through `/track`
// (ingest → Kafka → worker → ClickHouse), unlike `bun run seed`, which inserts
// directly. For testing ingest, live views and anything that reacts to new events.
//
//   bun run send track <event> [--project acme-shop] [--path /pricing] [--profile usr_x] [--prop k=v]... [--revenue 99]
//   bun run send identify <profileId> [--project] [--email] [--first-name] [--last-name] [--prop k=v]...
//   bun run send journey [--project acme-shop] [--sessions 1] [--realtime] [--seed 7]
//   options: --url <api> (default $API_URL), --client <id> --secret <secret> (default: the project's seeded client)

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { ARCHETYPES, archetypeById } from './archetypes';
import {
  type Archetype,
  Journey,
  type JourneyEvent,
} from './archetypes/archetype';
import { CAMPAIGNS } from './data/referrers';
import { projectIdFor } from './ids';
import type { Person, Visitor } from './model';
import { Rng } from './rng';
import { MANIFEST_FILE } from './seed.constants';
import { World } from './world';

const USAGE = `Usage: bun run send <track|identify|journey> [options]

  track <event>          send one event    --path /x  --profile usr_x  --prop k=v  --revenue 99
  identify <profileId>   send an identify  --email a@b  --first-name A  --last-name B  --prop k=v
  journey                generate a session with the project's archetype and replay it live
                         --sessions N (default 1)  --realtime (real dwell times; default caps gaps at 1s)  --seed N

  --project <id>         which seeded project (default: acme-web)
  --url <api>            default $API_URL
  --client <id> --secret <secret>   override the project's seeded write client
`;

/** Gaps between replayed events are capped so a journey takes seconds, not minutes. */
const MAX_GAP_MS = 1000;
const MANIFEST_PATH = resolve(import.meta.dir, '..', '..', '..', MANIFEST_FILE);
const DEFAULT_PROJECT = 'acme-web';

interface Manifest {
  projects: {
    id: string;
    archetype: string;
    clientId: string;
    clientSecret: string;
  }[];
}

interface Target {
  url: string;
  clientId: string;
  clientSecret: string;
  projectId: string;
  archetype: Archetype;
}

function readManifest(): Manifest | null {
  if (!existsSync(MANIFEST_PATH)) {
    return null;
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
}

function parseProps(values: string[] | undefined): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const entry of values ?? []) {
    const index = entry.indexOf('=');
    if (index <= 0) {
      throw new Error(`--prop expects key=value, got "${entry}"`);
    }
    const raw = entry.slice(index + 1);
    const asNumber = Number(raw);
    properties[entry.slice(0, index)] =
      raw === 'true'
        ? true
        : raw === 'false'
          ? false
          : raw !== '' && !Number.isNaN(asNumber)
            ? asNumber
            : raw;
  }
  return properties;
}

function resolveTarget(values: {
  url?: string;
  project?: string;
  client?: string;
  secret?: string;
}): Target {
  const url = (values.url ?? process.env.API_URL ?? '').replace(/\/$/, '');
  if (!url) {
    throw new Error('No API: pass --url or set API_URL.');
  }
  const projectId = values.project ?? DEFAULT_PROJECT;
  const archetype =
    ARCHETYPES.find((candidate) => projectIdFor(candidate) === projectId) ??
    archetypeById(projectId);
  const manifest = readManifest();
  const seeded = manifest?.projects.find((project) => project.id === projectId);
  const clientId = values.client ?? seeded?.clientId;
  const clientSecret = values.secret ?? seeded?.clientSecret;
  if (!(clientId && clientSecret)) {
    throw new Error(
      `No client for ${projectId}: run \`bun run seed\` first or pass --client and --secret.`
    );
  }
  return { url, clientId, clientSecret, projectId, archetype };
}

interface Sender {
  userAgent: string;
  ip: string;
}

async function post(
  target: Target,
  sender: Sender,
  body: unknown
): Promise<string> {
  const response = await fetch(`${target.url}/track`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'openpanel-client-id': target.clientId,
      'openpanel-client-secret': target.clientSecret,
      'openpanel-sdk-name': target.archetype.sdk.name,
      'openpanel-sdk-version': target.archetype.sdk.version,
      'user-agent': sender.userAgent,
      'x-client-ip': sender.ip,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return `${response.status} ${text}`;
}

function trackBody(
  name: string,
  properties: Record<string, unknown>,
  profileId?: string
) {
  return {
    type: 'track',
    payload: { name, properties, ...(profileId ? { profileId } : {}) },
  };
}

function identifyBody(person: Person) {
  // Empty strings fail validation (`avatar` must be a URL); send only what is set.
  const optional = Object.fromEntries(
    Object.entries({
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      avatar: person.avatar,
    }).filter(([, value]) => value !== '')
  );
  return {
    type: 'identify',
    payload: {
      profileId: person.id,
      ...optional,
      properties: person.properties,
    },
  };
}

/** The SDK's view of a journey event: `__path` as the full URL (or screen name), `__title`, custom properties. */
function sdkProperties(
  target: Target,
  event: JourneyEvent,
  landingQuery: string
): Record<string, unknown> {
  const path =
    target.archetype.deviceClass === 'native'
      ? event.path
      : `${target.archetype.origin}${event.path}${landingQuery}`;
  return {
    ...event.properties,
    __path: path,
    __title: event.title || undefined,
    ...(event.revenue !== undefined ? { __revenue: event.revenue } : {}),
  };
}

async function replay(
  target: Target,
  visitor: Visitor,
  events: readonly JourneyEvent[],
  utm: Record<string, string>,
  realtime: boolean
): Promise<void> {
  const sender = { userAgent: visitor.userAgent, ip: visitor.geo.ip };
  let identified: Person | null = visitor.identified ? visitor.person : null;
  let previous: Date | null = null;
  for (const [index, event] of events.entries()) {
    if (previous) {
      const gap = event.at.getTime() - previous.getTime();
      await sleep(realtime ? gap : Math.min(gap, MAX_GAP_MS));
    }
    previous = event.at;
    if (event.person && event.person !== identified) {
      identified = event.person;
      console.log(
        `identify ${event.person.id} → ${await post(target, sender, identifyBody(event.person))}`
      );
    }
    const landingQuery =
      index === 0 && Object.keys(utm).length
        ? `?${new URLSearchParams(utm)}`
        : '';
    const body = trackBody(
      event.name,
      sdkProperties(target, event, landingQuery),
      identified?.id
    );
    console.log(
      `${event.name.padEnd(28)} ${event.path.padEnd(28)} → ${await post(target, sender, body)}`
    );
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      url: { type: 'string' },
      client: { type: 'string' },
      secret: { type: 'string' },
      path: { type: 'string' },
      profile: { type: 'string' },
      prop: { type: 'string', multiple: true },
      revenue: { type: 'string' },
      email: { type: 'string' },
      'first-name': { type: 'string' },
      'last-name': { type: 'string' },
      sessions: { type: 'string' },
      realtime: { type: 'boolean', default: false },
      seed: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  const [command, argument] = positionals;
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return;
  }
  const target = resolveTarget(values);
  const rng = new Rng(`send/${values.seed ?? Date.now()}`);
  const world = new World(
    target.archetype,
    target.projectId,
    new Date(),
    () => undefined
  );
  const visitor = world.pick(rng, new Date());
  const sender = { userAgent: visitor.userAgent, ip: visitor.geo.ip };
  console.log(
    `→ ${target.url}  project ${target.projectId}  client ${target.clientId}`
  );

  if (command === 'track') {
    if (!argument) {
      throw new Error('track needs an event name');
    }
    const path = values.path ?? '/';
    const properties = {
      ...parseProps(values.prop),
      __path:
        target.archetype.deviceClass === 'native'
          ? path
          : `${target.archetype.origin}${path}`,
      ...(values.revenue ? { __revenue: Number(values.revenue) } : {}),
    };
    console.log(
      await post(
        target,
        sender,
        trackBody(argument, properties, values.profile)
      )
    );
    return;
  }
  if (command === 'identify') {
    if (!argument) {
      throw new Error('identify needs a profile id');
    }
    const person: Person = {
      id: argument,
      firstName: values['first-name'] ?? '',
      lastName: values['last-name'] ?? '',
      email: values.email ?? '',
      avatar: '',
      properties: Object.fromEntries(
        Object.entries(parseProps(values.prop)).map(([key, value]) => [
          key,
          String(value),
        ])
      ),
    };
    console.log(await post(target, sender, identifyBody(person)));
    return;
  }
  if (command === 'journey') {
    const sessions = Number(values.sessions ?? 1);
    for (let i = 0; i < sessions; i++) {
      const current = i === 0 ? visitor : world.pick(rng, new Date());
      const campaign = rng.chance(target.archetype.campaignChance)
        ? rng.pick(CAMPAIGNS)
        : null;
      const utm: Record<string, string> = campaign
        ? {
            utm_source: campaign.source,
            utm_medium: campaign.medium,
            utm_campaign: campaign.name,
          }
        : {};
      const journey = new Journey(
        rng,
        new Date(),
        target.archetype.dwellMedianSeconds,
        current.identified ? current.person : null
      );
      target.archetype.journey(rng, journey, current);
      console.log(
        `\nsession ${i + 1}: ${journey.events.length} events, ${current.person ? `person ${current.person.id}` : 'anonymous'}`
      );
      await replay(target, current, journey.events, utm, values.realtime);
      world.touch(current, new Date(), {
        identified: journey.identified !== null,
        anonymousEvents: journey.events.some((event) => event.person === null),
      });
    }
    return;
  }
  throw new Error(`Unknown command "${command}".\n${USAGE}`);
}

await main();
