// `.seed.json`: what was seeded, for agents, the Playwright suite and whatever tooling
// describes the worktree to them.

import { writeFileSync } from 'node:fs';
import type { PostgresSeed } from './postgres';
import { SEED_USER } from './seed.constants';

export interface SeedManifest {
  seed: number;
  size: string;
  days: number;
  sessionsPerDay: number;
  range: { from: string; to: string };
  seededAt: string;
  user: { email: string; password: string };
  organizationId: string;
  rootClient: { id: string; secret: string };
  /** The API this seed was made for (from `API_URL`), and the product's own MCP endpoint on it. */
  apiUrl: string | null;
  mcp: { url: string; token: string } | null;
  projects: {
    id: string;
    name: string;
    archetype: string;
    clientId: string;
    clientSecret: string;
    sessions: number;
    events: number;
    /** How users are identified in this project: what retention can show. */
    identity: string;
    conversions: string[];
    funnels: { name: string; steps: string[]; breakdowns: string[] }[];
  }[];
  totals: { sessions: number; events: number; profiles: number };
}

/** What the MCP settings page hands out: `<api>/mcp?token=base64(clientId:clientSecret)` for a read or root client. */
function mcpEndpoint(
  apiUrl: string | null,
  client: { id: string; secret: string }
): { url: string; token: string } | null {
  if (!apiUrl) {
    return null;
  }
  const token = Buffer.from(`${client.id}:${client.secret}`).toString('base64');
  return { url: `${apiUrl.replace(/\/$/, '')}/mcp?token=${token}`, token };
}

export function buildManifest(input: {
  seed: number;
  size: string;
  days: number;
  sessionsPerDay: number;
  from: Date;
  to: Date;
  postgres: PostgresSeed;
  apiUrl: string | null;
  perProject: Map<string, { sessions: number; events: number }>;
  totals: { sessions: number; events: number; profiles: number };
}): SeedManifest {
  return {
    seed: input.seed,
    size: input.size,
    days: input.days,
    sessionsPerDay: input.sessionsPerDay,
    range: { from: input.from.toISOString(), to: input.to.toISOString() },
    seededAt: new Date().toISOString(),
    user: { email: SEED_USER.email, password: SEED_USER.password },
    organizationId: input.postgres.organizationId,
    rootClient: input.postgres.rootClient,
    apiUrl: input.apiUrl,
    mcp: mcpEndpoint(input.apiUrl, input.postgres.rootClient),
    projects: input.postgres.projects.map((project) => ({
      id: project.id,
      name: project.name,
      archetype: project.archetype,
      clientId: project.client.id,
      clientSecret: project.client.secret,
      sessions: input.perProject.get(project.id)?.sessions ?? 0,
      events: input.perProject.get(project.id)?.events ?? 0,
      identity: project.identity,
      conversions: [...project.conversions],
      funnels: project.funnels.map((funnel) => ({
        name: funnel.name,
        steps: [...funnel.steps],
        breakdowns: [...funnel.breakdowns],
      })),
    })),
    totals: input.totals,
  };
}

export function writeManifest(path: string, manifest: SeedManifest): void {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function describeManifest(manifest: SeedManifest): string {
  const lines = [
    `Seeded ${manifest.totals.sessions.toLocaleString()} sessions / ${manifest.totals.events.toLocaleString()} events / ${manifest.totals.profiles.toLocaleString()} profiles`,
    `Range: ${manifest.range.from.slice(0, 10)} → ${manifest.range.to.slice(0, 10)} (${manifest.days} days, size ${manifest.size}, seed ${manifest.seed})`,
    `Login: ${manifest.user.email} / ${manifest.user.password}`,
    `Organization: ${manifest.organizationId}`,
    'Projects:',
    ...manifest.projects.map(
      (project) =>
        `  ${project.name} (${project.archetype})  id ${project.id}  client ${project.clientId}  secret ${project.clientSecret}`
    ),
    `Root client: ${manifest.rootClient.id}  secret ${manifest.rootClient.secret}`,
    manifest.mcp
      ? `MCP (streamable HTTP, root client): ${manifest.mcp.url}`
      : 'MCP: set API_URL to get the endpoint',
  ];
  return lines.join('\n');
}
