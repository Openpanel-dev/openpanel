// The Postgres side: one login, one organization, one project per archetype
// and a write client each, plus a root client for /manage. Mirrors what the
// onboarding flow creates (onboarding.service.ts), with deterministic ids so a
// re-run updates in place.

import { hash as argon2Hash } from '@node-rs/argon2';
import { db } from '@openpanel/db';
import { hashPassword } from '@openpanel/shared/server';
import type { Archetype } from './archetypes/archetype';
import { deterministicUuid, projectIdFor } from './ids';
import type { Rng } from './rng';
import {
  ORGANIZATION_ADMIN_ROLE,
  SEED_ORGANIZATION,
  SEED_USER,
  SUBSCRIPTION_EVENTS_LIMIT,
  SUBSCRIPTION_INTERVAL,
  SUBSCRIPTION_YEARS,
} from './seed.constants';

const MS_PER_YEAR = 365 * 86_400_000;
const SECRET_HEX_CHARS = 20;
/** Sign-in accepts `$argon2` hashes made with these parameters; copied from core's auth `hashPassword`. */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export interface SeededClient {
  id: string;
  secret: string;
}

export interface SeededProject {
  id: string;
  name: string;
  archetype: Archetype['id'];
  client: SeededClient;
  identity: string;
  conversions: readonly string[];
  funnels: Archetype['funnels'];
}

export interface PostgresSeed {
  userId: string;
  organizationId: string;
  rootClient: SeededClient;
  projects: SeededProject[];
}

function newSecret(rng: Rng): string {
  return `sec_${rng.hex(SECRET_HEX_CHARS)}`;
}

async function upsertUser(): Promise<string> {
  const user = await db.user.upsert({
    where: { email: SEED_USER.email },
    create: {
      id: SEED_USER.id,
      email: SEED_USER.email,
      firstName: SEED_USER.firstName,
      lastName: SEED_USER.lastName,
    },
    update: {
      firstName: SEED_USER.firstName,
      lastName: SEED_USER.lastName,
      deletedAt: null,
    },
  });
  const password = await argon2Hash(SEED_USER.password, ARGON2_OPTIONS);
  const account = await db.account.findFirst({
    where: { userId: user.id, provider: 'email' },
  });
  if (account) {
    await db.account.update({ where: { id: account.id }, data: { password } });
  } else {
    await db.account.create({
      data: { userId: user.id, provider: 'email', email: user.email, password },
    });
  }
  return user.id;
}

async function upsertOrganization(userId: string): Promise<string> {
  const now = new Date();
  const subscription = {
    subscriptionStatus: 'active',
    subscriptionStartsAt: now,
    subscriptionFirstStartedAt: now,
    subscriptionEndsAt: new Date(
      now.getTime() + SUBSCRIPTION_YEARS * MS_PER_YEAR
    ),
    subscriptionCanceledAt: null,
    subscriptionPauseAtPeriodEnd: false,
    subscriptionInterval: SUBSCRIPTION_INTERVAL,
    subscriptionPeriodEventsLimit: SUBSCRIPTION_EVENTS_LIMIT,
    subscriptionPeriodEventsCount: 0,
    subscriptionPeriodEventsCountExceededAt: null,
    windDownStartedAt: null,
    windDownStep: null,
  };
  const organization = await db.organization.upsert({
    where: { id: SEED_ORGANIZATION.id },
    create: {
      id: SEED_ORGANIZATION.id,
      name: SEED_ORGANIZATION.name,
      createdByUserId: userId,
      timezone: 'UTC',
      onboarding: '',
      ...subscription,
    },
    update: { name: SEED_ORGANIZATION.name, deleteAt: null, ...subscription },
  });
  await db.member.upsert({
    where: {
      organizationId_userId: { organizationId: organization.id, userId },
    },
    create: {
      organizationId: organization.id,
      userId,
      email: SEED_USER.email,
      role: ORGANIZATION_ADMIN_ROLE,
    },
    update: { role: ORGANIZATION_ADMIN_ROLE },
  });
  return organization.id;
}

/** Ingest verifies client secrets with scrypt (`verifyPassword`), so that is what the seed stores. */
/**
 * `.seed.json` advertises each project's conversions, and the manifest always
 * did, but nothing ever wrote the rows that make them conversions — so the
 * Conversions tab was empty on every seeded project. `event.service.ts` reads
 * these through `findMany({ where: { conversion: true } })`.
 *
 * Postgres only, and an upsert on the `(name, projectId)` unique, so re-running
 * just the Postgres half is enough; no ClickHouse reseed, no manifest change.
 */
async function upsertConversions(
  projectId: string,
  conversions: readonly string[]
): Promise<void> {
  for (const name of conversions) {
    await db.eventMeta.upsert({
      where: { name_projectId: { name, projectId } },
      create: { name, projectId, conversion: true },
      update: { conversion: true },
    });
  }
}

async function upsertClient(
  rng: Rng,
  input: {
    name: string;
    organizationId: string;
    projectId: string | null;
    type: 'write' | 'root';
  }
): Promise<SeededClient> {
  const id = deterministicUuid(`client:${input.projectId ?? 'root'}`);
  const secret = newSecret(rng);
  await db.client.upsert({
    where: { id },
    create: {
      id,
      name: input.name,
      organizationId: input.organizationId,
      projectId: input.projectId,
      type: input.type,
      secret: await hashPassword(secret),
    },
    update: { name: input.name, secret: await hashPassword(secret) },
  });
  return { id, secret };
}

async function upsertProject(
  rng: Rng,
  organizationId: string,
  archetype: Archetype
): Promise<SeededProject> {
  const id = projectIdFor(archetype);
  await db.project.upsert({
    where: { id },
    create: {
      id,
      name: archetype.projectName,
      organizationId,
      types: archetype.types,
      domain: archetype.domain,
      cors: archetype.origin ? ['*'] : [],
    },
    update: {
      name: archetype.projectName,
      types: archetype.types,
      domain: archetype.domain,
      deleteAt: null,
    },
  });
  await upsertConversions(id, archetype.conversions);
  const client = await upsertClient(rng, {
    name: `${archetype.projectName} Client`,
    organizationId,
    projectId: id,
    type: 'write',
  });
  return {
    id,
    name: archetype.projectName,
    archetype: archetype.id,
    client,
    identity: archetype.identity,
    conversions: archetype.conversions,
    funnels: archetype.funnels,
  };
}

export async function seedPostgres(
  rng: Rng,
  archetypes: readonly Archetype[]
): Promise<PostgresSeed> {
  const userId = await upsertUser();
  const organizationId = await upsertOrganization(userId);
  const rootClient = await upsertClient(rng, {
    name: 'Seed root client',
    organizationId,
    projectId: null,
    type: 'root',
  });
  const projects: SeededProject[] = [];
  for (const archetype of archetypes) {
    projects.push(await upsertProject(rng, organizationId, archetype));
  }
  return { userId, organizationId, rootClient, projects };
}

/** What the ingest path maintains on the project row once events arrive. */
export async function recordProjectStats(
  projectId: string,
  stats: { eventsCount: number; firstEventAt: Date | null }
): Promise<void> {
  await db.project.update({
    where: { id: projectId },
    data: { eventsCount: stats.eventsCount, firstEventAt: stats.firstEventAt },
  });
}
