import { sql } from '@openpanel/db/src/clickhouse/sql';
import { safeFetch } from '@openpanel/shared/server';
import { tool } from 'ai';
import { z } from 'zod';
import { chQuery } from '../../../../ch-query';
import { getMemberProjectGrants } from '../../../../shared/access-lookups';
import { isOriginAllowed } from '../../../../shared/origin-allowed';
import type { ChatToolContext } from '../context';
import { dashboardUrl } from './shared';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2_000_000;
// Mirrored literally in the ClickHouse query below.
const RECENT_WINDOW_DAYS = 1;
const HTTP_ERROR = 400;

const SCRIPT_URL = /openpanel\.dev\/op1\.js|\/op1\.js\b/i;
const INIT_CALL = /\bop\(\s*['"]init['"]/;
const SDK_PACKAGE = /@openpanel\/(web|nextjs|react|vue|nuxt|remix|astro|sdk)/;
const CLIENT_ID =
  /client[_-]?id['"]?\s*[:=]\s*['"]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})['"]/gi;

export type FindingLevel = 'ok' | 'warn' | 'error' | 'info';

export interface Finding {
  level: FindingLevel;
  /** Stable key so the UI and tests can refer to a check. */
  check: string;
  message: string;
}

export interface TrackingFacts {
  requestedUrl: string;
  storedDomain: string | null;
  pageOrigin: string | null;
  fetch: { ok: boolean; status?: number; finalUrl?: string; error?: string };
  snippet: {
    scriptTag: boolean;
    initCall: boolean;
    sdkPackage: boolean;
    clientIds: string[];
  };
  projectClients: {
    id: string;
    name: string;
    type: string;
    ignoreCorsAndSecret: boolean;
  }[];
  /** Where a found client id actually belongs, when not to this project. */
  foreignClients: { id: string; projectId: string | null }[];
  cors: string[];
  crossDomain: boolean;
  filters: { event: string[]; ip: number; profile: number };
  firstEventAt: string | null;
  lastEventAt: string | null;
  recentByOrigin: { origin: string; count: number; lastSeen: string }[];
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Turns the gathered facts into the checklist the user sees and the model explains. */
export function assessTracking(facts: TrackingFacts): Finding[] {
  const findings: Finding[] = [];
  const pageHost = facts.pageOrigin ? new URL(facts.pageOrigin).host : null;
  const storedHost = facts.storedDomain ? originOf(facts.storedDomain) : null;

  if (
    facts.storedDomain &&
    pageHost &&
    storedHost &&
    new URL(storedHost).host !== pageHost
  ) {
    findings.push({
      level: 'warn',
      check: 'domain',
      message: `The project's domain is ${facts.storedDomain}, but this check ran against ${facts.pageOrigin}.`,
    });
  } else if (facts.storedDomain) {
    findings.push({
      level: 'ok',
      check: 'domain',
      message: `Project domain ${facts.storedDomain} matches the page.`,
    });
  } else {
    findings.push({
      level: 'info',
      check: 'domain',
      message:
        'The project has no domain set; that is fine, it only drives defaults.',
    });
  }

  if (!facts.fetch.ok) {
    findings.push({
      level: 'error',
      check: 'fetch',
      message: `Could not load the page${facts.fetch.status ? ` (HTTP ${facts.fetch.status})` : ''}${facts.fetch.error ? `: ${facts.fetch.error}` : '.'}`,
    });
  }

  const { snippet } = facts;
  if (facts.fetch.ok) {
    if (snippet.scriptTag || snippet.initCall) {
      findings.push({
        level: 'ok',
        check: 'snippet',
        message: 'The OpenPanel snippet is on the page.',
      });
    } else if (snippet.sdkPackage) {
      findings.push({
        level: 'ok',
        check: 'snippet',
        message: 'An OpenPanel SDK package is referenced by the page.',
      });
    } else {
      findings.push({
        level: 'warn',
        check: 'snippet',
        message:
          'No OpenPanel snippet was found in the HTML. A framework SDK loaded from a JavaScript bundle is not visible here, so this is only a problem if the site uses the script tag.',
      });
    }
  }

  if (snippet.clientIds.length === 0) {
    if (facts.fetch.ok) {
      findings.push({
        level: 'info',
        check: 'clientId',
        message: 'No client id is visible in the HTML.',
      });
    }
  } else {
    for (const id of snippet.clientIds) {
      const own = facts.projectClients.find((client) => client.id === id);
      if (own) {
        findings.push({
          level: 'ok',
          check: 'clientId',
          message: `Client id ${id} is "${own.name}" (${own.type}) in this project.`,
        });
        continue;
      }
      const foreign = facts.foreignClients.find((client) => client.id === id);
      findings.push({
        level: 'error',
        check: 'clientId',
        message: foreign
          ? `Client id ${id} belongs to another project${foreign.projectId ? ` (${foreign.projectId})` : ''}, so its events land there, not here.`
          : `Client id ${id} does not exist. Events sent with it are rejected.`,
      });
    }
  }

  const pageClient = snippet.clientIds
    .map((id) => facts.projectClients.find((client) => client.id === id))
    .find(Boolean);
  if (pageClient?.ignoreCorsAndSecret) {
    findings.push({
      level: 'ok',
      check: 'cors',
      message: `Client "${pageClient.name}" skips the origin check.`,
    });
  } else if (facts.cors.length === 0) {
    findings.push({
      level: 'error',
      check: 'cors',
      message:
        'No allowed origins are set. Browser events without a client secret are rejected; add the site origin (or * for any) under project settings.',
    });
  } else if (
    facts.pageOrigin &&
    isOriginAllowed(facts.cors, facts.pageOrigin)
  ) {
    findings.push({
      level: 'ok',
      check: 'cors',
      message: `${facts.pageOrigin} is an allowed origin.`,
    });
  } else if (facts.pageOrigin) {
    findings.push({
      level: 'error',
      check: 'cors',
      message: `${facts.pageOrigin} is not in the allowed origins (${facts.cors.join(', ')}). Browser events from it are rejected.`,
    });
  }

  if (facts.filters.event.length > 0) {
    findings.push({
      level: 'info',
      check: 'filters',
      message: `Events matching these filters are dropped on arrival: ${facts.filters.event.join(', ')}.`,
    });
  }
  if (facts.filters.ip > 0 || facts.filters.profile > 0) {
    findings.push({
      level: 'info',
      check: 'filters',
      message: `${facts.filters.ip} IP filter(s) and ${facts.filters.profile} profile filter(s) also drop events.`,
    });
  }

  if (!facts.firstEventAt) {
    findings.push({
      level: 'error',
      check: 'data',
      message: 'This project has never received an event.',
    });
  } else if (facts.recentByOrigin.length === 0) {
    findings.push({
      level: 'warn',
      check: 'data',
      message: `No page views in the last ${RECENT_WINDOW_DAYS * 24} hours. The last event arrived ${facts.lastEventAt ?? 'at an unknown time'}.`,
    });
  } else {
    const fromPage = facts.pageOrigin
      ? facts.recentByOrigin.find((row) => row.origin === facts.pageOrigin)
      : undefined;
    if (fromPage) {
      findings.push({
        level: 'ok',
        check: 'data',
        message: `${fromPage.count} page views arrived from ${fromPage.origin} in the last 24 hours, the latest at ${fromPage.lastSeen}.`,
      });
    } else {
      const others = facts.recentByOrigin
        .slice(0, 3)
        .map((row) => `${row.origin || '(no origin)'}: ${row.count}`)
        .join(', ');
      findings.push({
        level: facts.pageOrigin ? 'warn' : 'info',
        check: 'data',
        message: facts.pageOrigin
          ? `No page views from ${facts.pageOrigin} in the last 24 hours, while other origins sent some (${others}).`
          : `Page views in the last 24 hours by origin: ${others}.`,
      });
    }
  }

  return findings;
}

async function fetchPage(
  url: string
): Promise<{ fetch: TrackingFacts['fetch']; html: string }> {
  try {
    const result = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      headers: { 'user-agent': 'OpenPanel tracking check' },
    });
    const html = result.body.toString('utf8');
    return {
      fetch: {
        ok: result.status < HTTP_ERROR,
        status: result.status,
        finalUrl: result.finalUrl,
      },
      html,
    };
  } catch (error) {
    return {
      fetch: {
        ok: false,
        error: error instanceof Error ? error.message : 'unknown error',
      },
      html: '',
    };
  }
}

function inspectHtml(html: string): TrackingFacts['snippet'] {
  const clientIds = new Set<string>();
  for (const match of html.matchAll(CLIENT_ID)) {
    const id = match[1];
    if (id) {
      clientIds.add(id.toLowerCase());
    }
  }
  return {
    scriptTag: SCRIPT_URL.test(html),
    initCall: INIT_CALL.test(html),
    sdkPackage: SDK_PACKAGE.test(html),
    clientIds: [...clientIds],
  };
}

async function recentPageViews(ctx: ChatToolContext) {
  const rows = await chQuery<{
    origin: string;
    count: string;
    last_seen: string;
  }>(
    ctx.deps,
    sql`SELECT origin, count() AS count, max(created_at) AS last_seen
        FROM events
        WHERE project_id = ${sql.string(ctx.projectId)}
          AND name = 'screen_view'
          AND created_at >= now() - INTERVAL 1 DAY
        GROUP BY origin
        ORDER BY count DESC
        LIMIT 20`
  );
  return rows.map((row) => ({
    origin: row.origin,
    count: Number(row.count),
    lastSeen: row.last_seen,
  }));
}

async function lastEventAt(ctx: ChatToolContext): Promise<string | null> {
  const rows = await chQuery<{ last_event: string | null }>(
    ctx.deps,
    sql`SELECT max(created_at) AS last_event FROM events WHERE project_id = ${sql.string(ctx.projectId)}`
  );
  const value = rows[0]?.last_event;
  return value && !value.startsWith('1970') ? value : null;
}

/**
 * Client ids found on the page that are not this project's. The owning
 * project is named only when the user may open it: a `selected`-scope
 * member must not learn sibling projects from a client id on a web page.
 */
async function findForeignClients(
  ctx: ChatToolContext,
  clientIds: string[]
): Promise<TrackingFacts['foreignClients']> {
  if (clientIds.length === 0) {
    return [];
  }
  const [clients, grants] = await Promise.all([
    ctx.deps.db.client.findMany({
      where: { id: { in: clientIds }, organizationId: ctx.organizationId },
      select: { id: true, projectId: true },
    }),
    getMemberProjectGrants(ctx.deps.db, {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    }),
  ]);
  const canOpen = (projectId: string | null) =>
    grants?.projectScope === 'all' ||
    (grants?.projects.some((grant) => grant.projectId === projectId) ?? false);
  return clients.map((client) => ({
    id: client.id,
    projectId: canOpen(client.projectId) ? client.projectId : null,
  }));
}

export async function gatherTrackingFacts(
  ctx: ChatToolContext,
  requestedUrl: string
): Promise<TrackingFacts> {
  const project = await ctx.deps.db.project.findUniqueOrThrow({
    where: { id: ctx.projectId },
    select: {
      domain: true,
      cors: true,
      crossDomain: true,
      filters: true,
      firstEventAt: true,
    },
  });
  const [{ fetch, html }, projectClients, recentByOrigin, lastEvent] =
    await Promise.all([
      fetchPage(requestedUrl),
      ctx.deps.db.client.findMany({
        where: { projectId: ctx.projectId },
        select: { id: true, name: true, type: true, ignoreCorsAndSecret: true },
      }),
      recentPageViews(ctx).catch(() => []),
      lastEventAt(ctx).catch(() => null),
    ]);
  const snippet = inspectHtml(html);
  const unknownIds = snippet.clientIds.filter(
    (id) => !projectClients.some((client) => client.id === id)
  );
  const foreignClients = await findForeignClients(ctx, unknownIds);
  const filters = project.filters ?? [];
  return {
    requestedUrl,
    storedDomain: project.domain || null,
    pageOrigin: originOf(fetch.finalUrl ?? requestedUrl),
    fetch,
    snippet,
    projectClients,
    foreignClients,
    cors: project.cors,
    crossDomain: project.crossDomain,
    filters: {
      event: filters
        .filter((filter) => filter.type === 'event')
        .map((filter) => (filter as { name: string }).name),
      ip: filters.filter((filter) => filter.type === 'ip').length,
      profile: filters.filter((filter) => filter.type === 'profile_id').length,
    },
    firstEventAt: project.firstEventAt?.toISOString() ?? null,
    lastEventAt: lastEvent,
    recentByOrigin,
  };
}

export function trackingTools(ctx: ChatToolContext) {
  return {
    diagnose_tracking: tool({
      description:
        "Check why events from a website are not showing up. Loads the page, looks for the OpenPanel snippet and client id, and checks them against this project's clients, allowed origins (CORS), event filters and the page views that actually arrived. Pass the URL the user mentions; without one it uses the project's configured domain, so confirm that domain with the user first when it is unclear.",
      inputSchema: z.object({
        url: z
          .string()
          .optional()
          .describe(
            'Page to check, e.g. https://example.com. Defaults to the project domain.'
          ),
      }),
      execute: async ({ url }) => {
        const project = await ctx.deps.db.project.findUniqueOrThrow({
          where: { id: ctx.projectId },
          select: { domain: true },
        });
        const target = url?.trim() || project.domain;
        if (!target) {
          return {
            error:
              'The project has no domain configured and no URL was given. Ask the user which website to check.',
          };
        }
        const facts = await gatherTrackingFacts(ctx, normalizeUrl(target));
        const findings = assessTracking(facts);
        return {
          url: facts.fetch.finalUrl ?? facts.requestedUrl,
          status: findings.some((finding) => finding.level === 'error')
            ? 'issues'
            : findings.some((finding) => finding.level === 'warn')
              ? 'warnings'
              : 'healthy',
          findings,
          clients: facts.projectClients.map((client) => ({
            id: client.id,
            name: client.name,
            type: client.type,
          })),
          allowedOrigins: facts.cors,
          settingsUrl: dashboardUrl(ctx, '/settings'),
          trackingUrl: dashboardUrl(ctx, '/settings/tracking'),
        };
      },
    }),
  };
}
