// The GSC OAuth token lifecycle, the Search Console API client, ClickHouse
// read/write, the AI-tool wrapper functions and the
// gscProjectSync/gscProjectBackfill job bodies.
//
// Every exported function takes `ServiceDeps` and reaches Postgres as
// `deps.db` and ClickHouse as `deps.ch`, so the requestId minted at the edge
// reaches the query. `getGscCannibalization` is `cacheablePerDeps`:
// `cacheable` keys on the call's ARGUMENTS, so the caller's deps travel
// beside the key rather than inside it and the Redis key stays
// byte-identical.
//
// `deps.ch` is the round-robin/retry proxy every other core module uses,
// which also applies the shared INSERT_DEFAULT_SETTINGS
// (`wait_end_of_query`, insert block size) to the four sync inserts here.
//
// ClickHouse queries here still go through raw SQL strings, not the `sql`
// tag — this module's queries haven't been converted yet.

import type { ClickHouseSettings } from '@clickhouse/client';
import { decrypt, encrypt } from '@openpanel/shared/server';
import { cacheablePerDeps } from '../../cacheable-per-deps';
import type { CoreConfig } from '../../config';
import type { Logger } from '../../logger';
import { TRPCNotFoundError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import { TABLE_NAMES } from '../../shared/ch-tables';
import { googleGscClient } from '../auth/auth.service';

const BACKFILL_MONTHS = 6;
const CHUNK_DAYS = 14;
const CANNIBALIZATION_CACHE_TTL_SEC = 60 * 60 * 4;
const GSC_ROW_LIMIT = 25_000;
const GIB = 1024 ** 3;
const TOP_N_SPILL_BYTES = GIB;
const TOP_N_MEMORY_LIMIT_BYTES = 3 * GIB;

/**
 * The top-N page/query reads hash every distinct key in the window before
 * `LIMIT` applies (a year of a large property: 24.5M keys, 6.8 GiB peak), and
 * the SEO page issues both at once. Spilling the GROUP BY to disk bounds that
 * without changing a row; the cap stops one read from exhausting the server.
 */
const GSC_TOP_N_QUERY_SETTINGS: ClickHouseSettings = {
  max_bytes_before_external_group_by: String(TOP_N_SPILL_BYTES),
  max_memory_usage: String(TOP_N_MEMORY_LIMIT_BYTES),
};

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

async function refreshGscToken(
  config: CoreConfig,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const { clientId, clientSecret } = config.auth.googleGsc;
  if (!(clientId && clientSecret)) {
    throw new Error(
      'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set in this environment'
    );
  }

  // Arctic's Google client already implements this grant — same clientId/
  // clientSecret/tokenEndpoint the authorization-code exchange below uses.
  try {
    const tokens =
      await googleGscClient(config).refreshAccessToken(refreshToken);
    return {
      accessToken: tokens.accessToken(),
      expiresAt: tokens.accessTokenExpiresAt(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to refresh GSC token: ${message}`);
  }
}

export async function getGscAccessToken(
  deps: ServiceDeps,
  projectId: string
): Promise<string> {
  const db = deps.db;
  const conn = await db.gscConnection.findUniqueOrThrow({
    where: { projectId },
  });

  if (
    conn.accessTokenExpiresAt &&
    conn.accessTokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    deps.logger.info(
      { projectId, expiresAt: conn.accessTokenExpiresAt },
      'GSC using cached access token'
    );
    return decrypt(deps.config.encryptionKey, conn.accessToken);
  }

  deps.logger.info(
    {
      projectId,
      expiresAt: conn.accessTokenExpiresAt,
      hasRefreshToken: !!conn.refreshToken,
    },
    'GSC access token expired, attempting refresh'
  );

  try {
    const { accessToken, expiresAt } = await refreshGscToken(
      deps.config,
      decrypt(deps.config.encryptionKey, conn.refreshToken)
    );
    await db.gscConnection.update({
      where: { projectId },
      data: {
        accessToken: encrypt(deps.config.encryptionKey, accessToken),
        accessTokenExpiresAt: expiresAt,
      },
    });
    deps.logger.info(
      { projectId, expiresAt },
      'GSC token refreshed successfully'
    );
    return accessToken;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to refresh token';
    deps.logger.error(
      { err: error, projectId, errorMessage },
      'GSC token refresh failed'
    );
    await db.gscConnection.update({
      where: { projectId },
      data: {
        lastSyncStatus: 'token_expired',
        lastSyncError: errorMessage,
      },
    });
    throw new Error(
      `GSC token refresh failed for project ${projectId}: ${errorMessage}`
    );
  }
}

export async function listGscSites(
  deps: ServiceDeps,
  projectId: string
): Promise<GscSite[]> {
  const accessToken = await getGscAccessToken(deps, projectId);
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list GSC sites: ${text}`);
  }

  const data = (await res.json()) as {
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
  };
  return data.siteEntry ?? [];
}

interface GscApiRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscDimensionFilter {
  dimension: string;
  operator: string;
  expression: string;
}

interface GscFilterGroup {
  filters: GscDimensionFilter[];
}

async function queryGscSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  dimensionFilterGroups?: GscFilterGroup[]
): Promise<GscApiRow[]> {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`;

  const allRows: GscApiRow[] = [];
  let startRow = 0;

  while (true) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        rowLimit: GSC_ROW_LIMIT,
        startRow,
        dataState: 'all',
        ...(dimensionFilterGroups && { dimensionFilterGroups }),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `GSC query failed for dimensions [${dimensions.join(',')}]: ${text}`
      );
    }

    const data = (await res.json()) as { rows?: GscApiRow[] };
    const rows = data.rows ?? [];
    allRows.push(...rows);

    if (rows.length < GSC_ROW_LIMIT) {
      break;
    }
    startRow += GSC_ROW_LIMIT;
  }

  return allRows;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nowString(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

export async function syncGscData(
  deps: ServiceDeps,
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  const db = deps.db;
  const conn = await db.gscConnection.findUniqueOrThrow({
    where: { projectId },
  });

  if (!conn.siteUrl) {
    throw new Error('No GSC site URL configured for this project');
  }

  const accessToken = await getGscAccessToken(deps, projectId);
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  const syncedAt = nowString();
  const ch = deps.ch;

  // 1. Daily totals — authoritative numbers for overview chart
  const dailyRows = await queryGscSearchAnalytics(
    accessToken,
    conn.siteUrl,
    start,
    end,
    ['date']
  );

  if (dailyRows.length > 0) {
    await ch.insert({
      table: 'gsc_daily',
      values: dailyRows.map((row) => ({
        project_id: projectId,
        date: row.keys[0] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        synced_at: syncedAt,
      })),
      format: 'JSONEachRow',
    });
  }

  // 2. Per-page breakdown
  const pageRows = await queryGscSearchAnalytics(
    accessToken,
    conn.siteUrl,
    start,
    end,
    ['date', 'page']
  );

  if (pageRows.length > 0) {
    await ch.insert({
      table: 'gsc_pages_daily',
      values: pageRows.map((row) => ({
        project_id: projectId,
        date: row.keys[0] ?? '',
        page: row.keys[1] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        synced_at: syncedAt,
      })),
      format: 'JSONEachRow',
    });
  }

  // 3. Per-query breakdown
  const queryRows = await queryGscSearchAnalytics(
    accessToken,
    conn.siteUrl,
    start,
    end,
    ['date', 'query']
  );

  if (queryRows.length > 0) {
    await ch.insert({
      table: 'gsc_queries_daily',
      values: queryRows.map((row) => ({
        project_id: projectId,
        date: row.keys[0] ?? '',
        query: row.keys[1] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        synced_at: syncedAt,
      })),
      format: 'JSONEachRow',
    });
  }
}

export async function getGscOverview(
  deps: ServiceDeps,
  projectId: string,
  startDate: string,
  endDate: string,
  interval: 'day' | 'week' | 'month' = 'day'
): Promise<
  Array<{
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>
> {
  const dateExpr =
    interval === 'month'
      ? 'toStartOfMonth(date)'
      : interval === 'week'
        ? 'toStartOfWeek(date)'
        : 'date';

  const ch = deps.ch;
  const result = await ch.query({
    query: `
      SELECT
        ${dateExpr} as date,
        sum(clicks) as clicks,
        sum(impressions) as impressions,
        avg(ctr) as ctr,
        avg(position) as position
      FROM gsc_daily
      FINAL
      WHERE project_id = {projectId: String}
        AND date >= {startDate: String}
        AND date <= {endDate: String}
      GROUP BY date
      ORDER BY date ASC
    `,
    query_params: { projectId, startDate, endDate },
    format: 'JSONEachRow',
  });
  return result.json();
}

export async function getGscPages(
  deps: ServiceDeps,
  projectId: string,
  startDate: string,
  endDate: string,
  limit = 100
): Promise<
  Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>
> {
  const ch = deps.ch;
  const result = await ch.query({
    query: `
      SELECT
        page,
        sum(clicks) as clicks,
        sum(impressions) as impressions,
        avg(ctr) as ctr,
        avg(position) as position
      FROM gsc_pages_daily
      FINAL
      WHERE project_id = {projectId: String}
        AND date >= {startDate: String}
        AND date <= {endDate: String}
      GROUP BY page
      ORDER BY clicks DESC
      LIMIT {limit: UInt32}
    `,
    query_params: { projectId, startDate, endDate, limit },
    format: 'JSONEachRow',
    clickhouse_settings: GSC_TOP_N_QUERY_SETTINGS,
  });
  return result.json();
}

export interface GscCannibalizedQuery {
  query: string;
  totalImpressions: number;
  totalClicks: number;
  pages: Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}

export const getGscCannibalization = cacheablePerDeps(
  'getGscCannibalization',
  async (
    deps: ServiceDeps,
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<GscCannibalizedQuery[]> => {
    const db = deps.db;
    const conn = await db.gscConnection.findUniqueOrThrow({
      where: { projectId },
    });
    const accessToken = await getGscAccessToken(deps, projectId);

    const rows = await queryGscSearchAnalytics(
      accessToken,
      conn.siteUrl,
      startDate,
      endDate,
      ['query', 'page']
    );

    const map = new Map<
      string,
      {
        totalImpressions: number;
        totalClicks: number;
        pages: GscCannibalizedQuery['pages'];
      }
    >();

    for (const row of rows) {
      const query = row.keys[0] ?? '';
      // Strip hash fragments — GSC records heading anchors (e.g. /page#section)
      // as separate URLs but Google treats them as the same page
      let page = row.keys[1] ?? '';
      try {
        const u = new URL(page);
        u.hash = '';
        page = u.toString();
      } catch {
        page = page.split('#')[0] ?? page;
      }

      const entry = map.get(query) ?? {
        totalImpressions: 0,
        totalClicks: 0,
        pages: [],
      };
      entry.totalImpressions += row.impressions;
      entry.totalClicks += row.clicks;
      // Merge into existing page entry if already seen (from a different hash variant)
      const existing = entry.pages.find((p) => p.page === page);
      if (existing) {
        const totalImpressions = existing.impressions + row.impressions;
        if (totalImpressions > 0) {
          existing.position =
            (existing.position * existing.impressions +
              row.position * row.impressions) /
            totalImpressions;
        }
        existing.clicks += row.clicks;
        existing.impressions += row.impressions;
        existing.ctr =
          existing.impressions > 0 ? existing.clicks / existing.impressions : 0;
      } else {
        entry.pages.push({
          page,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        });
      }
      map.set(query, entry);
    }

    return [...map.entries()]
      .filter(([, v]) => v.pages.length >= 2 && v.totalImpressions >= 100)
      .sort(([, a], [, b]) => b.totalImpressions - a.totalImpressions)
      .slice(0, 50)
      .map(([query, v]) => ({
        query,
        totalImpressions: v.totalImpressions,
        totalClicks: v.totalClicks,
        pages: v.pages.sort((a, b) =>
          a.position !== b.position
            ? a.position - b.position
            : b.impressions - a.impressions
        ),
      }));
  },
  CANNIBALIZATION_CACHE_TTL_SEC
);

export async function getGscPageDetails(
  deps: ServiceDeps,
  projectId: string,
  page: string,
  startDate: string,
  endDate: string
): Promise<{
  timeseries: Array<{
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}> {
  const db = deps.db;
  const conn = await db.gscConnection.findUniqueOrThrow({
    where: { projectId },
  });
  const accessToken = await getGscAccessToken(deps, projectId);
  const filterGroups: GscFilterGroup[] = [
    { filters: [{ dimension: 'page', operator: 'equals', expression: page }] },
  ];

  const [timeseriesRows, queryRows] = await Promise.all([
    queryGscSearchAnalytics(
      accessToken,
      conn.siteUrl,
      startDate,
      endDate,
      ['date'],
      filterGroups
    ),
    queryGscSearchAnalytics(
      accessToken,
      conn.siteUrl,
      startDate,
      endDate,
      ['query'],
      filterGroups
    ),
  ]);

  return {
    timeseries: timeseriesRows.map((row) => ({
      date: row.keys[0] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })),
    queries: queryRows.map((row) => ({
      query: row.keys[0] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })),
  };
}

export async function getGscQueryDetails(
  deps: ServiceDeps,
  projectId: string,
  query: string,
  startDate: string,
  endDate: string
): Promise<{
  timeseries: Array<{
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  pages: Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}> {
  const db = deps.db;
  const conn = await db.gscConnection.findUniqueOrThrow({
    where: { projectId },
  });
  const accessToken = await getGscAccessToken(deps, projectId);
  const filterGroups: GscFilterGroup[] = [
    {
      filters: [{ dimension: 'query', operator: 'equals', expression: query }],
    },
  ];

  const [timeseriesRows, pageRows] = await Promise.all([
    queryGscSearchAnalytics(
      accessToken,
      conn.siteUrl,
      startDate,
      endDate,
      ['date'],
      filterGroups
    ),
    queryGscSearchAnalytics(
      accessToken,
      conn.siteUrl,
      startDate,
      endDate,
      ['page'],
      filterGroups
    ),
  ]);

  return {
    timeseries: timeseriesRows.map((row) => ({
      date: row.keys[0] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })),
    pages: pageRows.map((row) => ({
      page: row.keys[0] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })),
  };
}

export async function getGscQueries(
  deps: ServiceDeps,
  projectId: string,
  startDate: string,
  endDate: string,
  limit = 100
): Promise<
  Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>
> {
  const ch = deps.ch;
  const result = await ch.query({
    query: `
      SELECT
        query,
        sum(clicks) as clicks,
        sum(impressions) as impressions,
        avg(ctr) as ctr,
        avg(position) as position
      FROM gsc_queries_daily
      FINAL
      WHERE project_id = {projectId: String}
        AND date >= {startDate: String}
        AND date <= {endDate: String}
      GROUP BY query
      ORDER BY clicks DESC
      LIMIT {limit: UInt32}
    `,
    query_params: { projectId, startDate, endDate, limit },
    format: 'JSONEachRow',
    clickhouse_settings: GSC_TOP_N_QUERY_SETTINGS,
  });
  return result.json();
}

// --------------------------------------------------------------------------
// Connection CRUD.
// ---------------------------------------------------------------------------

export interface GscConnectionSummary {
  id: string;
  siteUrl: string;
  lastSyncedAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  backfillStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getGscConnection(
  deps: ServiceDeps,
  projectId: string
): Promise<GscConnectionSummary | null> {
  const db = deps.db;
  return db.gscConnection.findUnique({
    where: { projectId },
    select: {
      id: true,
      siteUrl: true,
      lastSyncedAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
      backfillStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function selectGscSite(
  deps: ServiceDeps,
  projectId: string,
  siteUrl: string
): Promise<void> {
  const db = deps.db;
  const conn = await db.gscConnection.findUnique({ where: { projectId } });
  if (!conn) {
    throw new TRPCNotFoundError('GSC connection not found');
  }

  await db.gscConnection.update({
    where: { projectId },
    data: { siteUrl, backfillStatus: 'pending' },
  });
}

export async function disconnectGscConnection(
  deps: ServiceDeps,
  projectId: string
): Promise<void> {
  const db = deps.db;
  await db.gscConnection.deleteMany({ where: { projectId } });
}

// --------------------------------------------------------------------------
// Dashboard aggregate queries — date resolution and search/AI-engine
// breakdown logic.
// ---------------------------------------------------------------------------

export interface GscDateRangeInput {
  range: string;
  startDate?: string | null;
  endDate?: string | null;
}

export async function resolveGscDateRange(
  deps: ServiceDeps,
  projectId: string,
  input: GscDateRangeInput
): Promise<{ startDate: string; endDate: string }> {
  const { getSettingsForProject } = await import(
    '../organization/organization.service'
  );
  const { getChartStartEndDate } = await import('../report/src/chart-dates');
  const { timezone } = await getSettingsForProject(deps, projectId);
  const { startDate, endDate } = getChartStartEndDate(
    {
      range: input.range as never,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    timezone
  );
  return {
    startDate: startDate.slice(0, 10),
    endDate: endDate.slice(0, 10),
  };
}

/**
 * ClickHouse stores the same AI referrer under several spellings: the parsed
 * display name ('ChatGPT', 'Google Gemini'), the bare host ('chatgpt.com') and
 * the full origin ('https://kagi.com'). Normalize before matching so every
 * spelling lands on the same engine.
 */
const NORMALIZED_REFERRER_NAME =
  "lower(regexp_replace(referrer_name, '^https?://(www[.])?', ''))";

const AI_REFERRERS = [
  {
    canonical: 'chatgpt.com',
    aliases: [
      'chatgpt',
      'chatgpt.com',
      'chat.openai.com',
      'openai',
      'openai.com',
    ],
  },
  {
    canonical: 'claude.ai',
    aliases: ['claude', 'claude.ai', 'anthropic', 'anthropic.com'],
  },
  {
    canonical: 'perplexity.ai',
    aliases: ['perplexity', 'perplexity.ai'],
  },
  {
    canonical: 'gemini.google.com',
    aliases: [
      'gemini',
      'google gemini',
      'gemini.google.com',
      'bard.google.com',
    ],
  },
  {
    canonical: 'copilot.com',
    aliases: [
      'copilot',
      'copilot.com',
      'copilot.microsoft.com',
      'microsoft copilot',
    ],
  },
  { canonical: 'grok.com', aliases: ['grok', 'grok.com'] },
  {
    canonical: 'mistral.ai',
    aliases: ['mistral', 'mistral.ai', 'chat.mistral.ai', 'le chat'],
  },
  {
    canonical: 'kagi.com',
    aliases: ['kagi', 'kagi.com', 'assistant.kagi.com'],
  },
] as const satisfies ReadonlyArray<{
  canonical: string;
  aliases: readonly string[];
}>;

const quoteList = (values: readonly string[]) =>
  values.map((value) => `'${value}'`).join(', ');

/** `norm` is the alias bound by AI_REFERRER_CTE below. */
const AI_REFERRER_CTE = `WITH ${NORMALIZED_REFERRER_NAME} AS norm`;

const AI_REFERRER_FILTER = `norm IN (${quoteList(
  AI_REFERRERS.flatMap((engine) => engine.aliases)
)})`;

/** Collapses every alias onto one row per engine. */
const AI_REFERRER_CANONICAL_NAME = `multiIf(${AI_REFERRERS.map(
  (engine) => `norm IN (${quoteList(engine.aliases)}), '${engine.canonical}'`
).join(', ')}, norm)`;

/**
 * Half-open windows so the last day of the range is included and the previous
 * window ends exactly where the current one starts (no gap, no overlap).
 */
function getComparisonWindows(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const endExclusive = new Date(`${endDate}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const previousStart = new Date(
    start.getTime() - (endExclusive.getTime() - start.getTime())
  );
  const fmt = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');
  return {
    current: { start: fmt(start), end: fmt(endExclusive) },
    previous: { start: fmt(previousStart), end: fmt(start) },
  };
}

export async function getGscSearchEngines(
  deps: ServiceDeps,
  projectId: string,
  startDate: string,
  endDate: string
) {
  const windows = getComparisonWindows(startDate, endDate);
  const ch = deps.ch;

  const WHERE = `project_id = {projectId: String}
      AND referrer_type = 'search'
      AND created_at >= {start: String}
      AND created_at < {end: String}`;
  const params = (window: { start: string; end: string }) => ({
    projectId,
    start: window.start,
    end: window.end,
  });

  const [enginesRes, currentRes, prevRes] = await Promise.all([
    ch.query({
      query: `SELECT
        referrer_name as name,
        count(*) as sessions
      FROM ${TABLE_NAMES.sessions}
      WHERE ${WHERE}
      GROUP BY name
      ORDER BY sessions DESC
      LIMIT 10`,
      query_params: params(windows.current),
      format: 'JSONEachRow',
    }),
    ch.query({
      query: `SELECT count(*) as sessions
      FROM ${TABLE_NAMES.sessions}
      WHERE ${WHERE}`,
      query_params: params(windows.current),
      format: 'JSONEachRow',
    }),
    ch.query({
      query: `SELECT count(*) as sessions
      FROM ${TABLE_NAMES.sessions}
      WHERE ${WHERE}`,
      query_params: params(windows.previous),
      format: 'JSONEachRow',
    }),
  ]);

  const engines = await enginesRes.json<{ name: string; sessions: number }>();
  const [currentResult] = await currentRes.json<{ sessions: number }>();
  const [prevResult] = await prevRes.json<{ sessions: number }>();

  return {
    engines,
    // Counted separately from `engines`, which is capped at the top 10, so
    // the total compares like-for-like with the previous period.
    total: currentResult?.sessions ?? 0,
    previousTotal: prevResult?.sessions ?? 0,
  };
}

export async function getGscAiEngines(
  deps: ServiceDeps,
  projectId: string,
  startDate: string,
  endDate: string
) {
  const windows = getComparisonWindows(startDate, endDate);
  const ch = deps.ch;

  // Matched by name — will switch to referrer_type = 'ai' once available.
  // AI_REFERRER_FILTER is fixed, non-user text; only the caller's own
  // projectId/dates need to be bound.
  const WHERE = `project_id = {projectId: String}
      AND ${AI_REFERRER_FILTER}
      AND created_at >= {start: String}
      AND created_at < {end: String}`;
  const params = (window: { start: string; end: string }) => ({
    projectId,
    start: window.start,
    end: window.end,
  });

  const [enginesRes, prevRes] = await Promise.all([
    ch.query({
      query: `${AI_REFERRER_CTE}
      SELECT ${AI_REFERRER_CANONICAL_NAME} as name, count(*) as sessions
      FROM ${TABLE_NAMES.sessions}
      WHERE ${WHERE}
      GROUP BY name
      ORDER BY sessions DESC`,
      query_params: params(windows.current),
      format: 'JSONEachRow',
    }),
    ch.query({
      query: `${AI_REFERRER_CTE}
      SELECT count(*) as sessions
      FROM ${TABLE_NAMES.sessions}
      WHERE ${WHERE}`,
      query_params: params(windows.previous),
      format: 'JSONEachRow',
    }),
  ]);

  const engines = await enginesRes.json<{ name: string; sessions: number }>();
  const [prevResult] = await prevRes.json<{ sessions: number }>();

  return {
    engines,
    // The filter is a fixed alias set, so the grouped rows are the whole
    // population — no LIMIT, and the total matches the previous period.
    total: engines.reduce((sum, engine) => sum + engine.sessions, 0),
    previousTotal: prevResult?.sessions ?? 0,
  };
}

export async function getGscPreviousOverview(
  deps: ServiceDeps,
  projectId: string,
  startDate: string,
  endDate: string,
  interval: 'day' | 'week' | 'month' = 'day'
) {
  const startMs = new Date(startDate).getTime();
  const duration = new Date(endDate).getTime() - startMs;
  const prevEnd = new Date(startMs - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return getGscOverview(
    deps,
    projectId,
    fmt(prevStart),
    fmt(prevEnd),
    interval
  );
}

// ---------------------------------------------------------------------------
// AI-tool wrappers — consumed by apps/api's assistant SEO tools and the
// /insights REST surface.
// ---------------------------------------------------------------------------

export interface GscQueryOpportunity {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  opportunity_score: number;
  reason: string;
}

const CTR_BENCHMARKS: Record<string, number> = {
  '1': 0.28,
  '2': 0.15,
  '3': 0.11,
  '4-6': 0.065,
  '7-10': 0.035,
  '11-20': 0.012,
};

function getCtrBenchmark(position: number): number {
  if (position <= 1) {
    return CTR_BENCHMARKS['1'] ?? 0.28;
  }
  if (position <= 2) {
    return CTR_BENCHMARKS['2'] ?? 0.15;
  }
  if (position <= 3) {
    return CTR_BENCHMARKS['3'] ?? 0.11;
  }
  if (position <= 6) {
    return CTR_BENCHMARKS['4-6'] ?? 0.065;
  }
  if (position <= 10) {
    return CTR_BENCHMARKS['7-10'] ?? 0.035;
  }
  return CTR_BENCHMARKS['11-20'] ?? 0.012;
}

function computeOpportunities(
  queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>
): GscQueryOpportunity[] {
  return queries
    .filter((q) => q.position >= 4 && q.position <= 20 && q.impressions >= 50)
    .map((q) => {
      const benchmark = getCtrBenchmark(q.position);
      const ctrGap = Math.max(0, benchmark - q.ctr);
      const opportunity_score =
        Math.round(q.impressions * (1 / q.position) * (1 + ctrGap) * 100) / 100;

      let reason: string;
      if (q.position <= 6) {
        reason = `Position ${q.position.toFixed(1)} — one rank improvement could significantly boost clicks`;
      } else if (q.ctr < benchmark * 0.5) {
        reason = `CTR (${(q.ctr * 100).toFixed(1)}%) is well below expected ${(benchmark * 100).toFixed(1)}% — title/meta optimization may help`;
      } else {
        reason = `Position ${q.position.toFixed(1)} with ${q.impressions} impressions — push to page 1 for major gains`;
      }

      return {
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        ctr: Math.round(q.ctr * 10_000) / 100,
        position: Math.round(q.position * 10) / 10,
        opportunity_score,
        reason,
      };
    })
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, 50);
}

export async function gscGetOverviewCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    interval?: 'day' | 'week' | 'month';
  }
) {
  const data = await getGscOverview(
    deps,
    input.projectId,
    input.startDate,
    input.endDate,
    input.interval ?? 'day'
  );
  return {
    data,
    summary: {
      total_clicks: data.reduce((s, r) => s + r.clicks, 0),
      total_impressions: data.reduce((s, r) => s + r.impressions, 0),
      avg_ctr:
        data.length > 0
          ? Math.round(
              (data.reduce((s, r) => s + r.ctr, 0) / data.length) * 10_000
            ) / 100
          : 0,
      avg_position:
        data.length > 0
          ? Math.round(
              (data.reduce((s, r) => s + r.position, 0) / data.length) * 10
            ) / 10
          : 0,
    },
  };
}

export async function gscGetTopPagesCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    limit?: number;
  }
) {
  return getGscPages(
    deps,
    input.projectId,
    input.startDate,
    input.endDate,
    input.limit ?? 100
  );
}

export async function gscGetPageDetailsCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    page: string;
  }
) {
  return getGscPageDetails(
    deps,
    input.projectId,
    input.page,
    input.startDate,
    input.endDate
  );
}

export async function gscGetTopQueriesCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    limit?: number;
  }
) {
  return getGscQueries(
    deps,
    input.projectId,
    input.startDate,
    input.endDate,
    input.limit ?? 100
  );
}

export async function gscGetQueryOpportunitiesCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    minImpressions?: number;
  }
) {
  const queries = await getGscQueries(
    deps,
    input.projectId,
    input.startDate,
    input.endDate,
    5000
  );
  const filtered = queries.filter(
    (q) => q.impressions >= (input.minImpressions ?? 50)
  );
  const opportunities = computeOpportunities(filtered);
  return {
    opportunities,
    total_analyzed: filtered.length,
    min_impressions: input.minImpressions ?? 50,
  };
}

export async function gscGetQueryDetailsCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    query: string;
  }
) {
  return getGscQueryDetails(
    deps,
    input.projectId,
    input.query,
    input.startDate,
    input.endDate
  );
}

export async function gscGetCannibalizationCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
  }
) {
  return getGscCannibalization(
    deps,
    input.projectId,
    input.startDate,
    input.endDate
  );
}

// --------------------------------------------------------------------------
// Job bodies. Each fully owns its status-update bookkeeping so the worker
// file is a bare dispatch.
// ---------------------------------------------------------------------------

/** The `gscSync` cron fan-out: every project with a connected GSC site. */
export async function listGscConnectionsForSync(
  deps: ServiceDeps
): Promise<{ projectId: string }[]> {
  const db = deps.db;
  return db.gscConnection.findMany({
    where: { siteUrl: { not: '' } },
    select: { projectId: true },
  });
}

/** The `gscProjectSync` job body: rolling 3-day window (GSC data arrives late). */
export async function runGscProjectSync(
  deps: ServiceDeps,
  projectId: string,
  logger: Logger = deps.logger
): Promise<void> {
  const db = deps.db;
  const conn = await db.gscConnection.findUnique({ where: { projectId } });
  if (!conn?.siteUrl) {
    logger.warn({ projectId }, 'GSC sync skipped: no connection or siteUrl');
    return;
  }

  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // yesterday
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 2); // 3 days total

    await syncGscData(deps, projectId, startDate, endDate);

    await db.gscConnection.update({
      where: { projectId },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
      },
    });
    logger.info({ projectId }, 'GSC sync completed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.gscConnection.update({
      where: { projectId },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: 'error',
        lastSyncError: message,
      },
    });
    logger.error({ err: error, projectId }, 'GSC sync failed');
    throw error;
  }
}

/** The `gscProjectBackfill` job body: chunked to avoid timeouts and API limits. */
export async function runGscProjectBackfill(
  deps: ServiceDeps,
  projectId: string,
  logger: Logger = deps.logger
): Promise<void> {
  const db = deps.db;
  const conn = await db.gscConnection.findUnique({ where: { projectId } });
  if (!conn?.siteUrl) {
    logger.warn(
      { projectId },
      'GSC backfill skipped: no connection or siteUrl'
    );
    return;
  }

  await db.gscConnection.update({
    where: { projectId },
    data: { backfillStatus: 'running' },
  });

  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // yesterday

    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - BACKFILL_MONTHS);

    let chunkEnd = new Date(endDate);
    while (chunkEnd > startDate) {
      const chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() - CHUNK_DAYS + 1);
      if (chunkStart < startDate) {
        chunkStart.setTime(startDate.getTime());
      }

      logger.info(
        {
          projectId,
          from: chunkStart.toISOString().slice(0, 10),
          to: chunkEnd.toISOString().slice(0, 10),
        },
        'GSC backfill chunk'
      );

      await syncGscData(deps, projectId, chunkStart, chunkEnd);

      chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() - 1);
    }

    await db.gscConnection.update({
      where: { projectId },
      data: {
        backfillStatus: 'completed',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
      },
    });
    logger.info({ projectId }, 'GSC backfill completed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.gscConnection.update({
      where: { projectId },
      data: {
        backfillStatus: 'failed',
        lastSyncStatus: 'error',
        lastSyncError: message,
      },
    });
    logger.error({ err: error, projectId }, 'GSC backfill failed');
    throw error;
  }
}

// --------------------------------------------------------------------------
// OAuth callback business logic. Cookie reading/signing and the redirect
// stay with the transport route; this is the transport-agnostic part.
// ---------------------------------------------------------------------------

export interface GscOAuthCallbackInput {
  code: string;
  state: string;
  storedState: string;
  codeVerifier: string;
  projectId: string;
}

export interface GscOAuthCallbackResult {
  organizationId: string;
}

export async function completeGscOAuthCallback(
  deps: ServiceDeps,
  input: GscOAuthCallbackInput
): Promise<GscOAuthCallbackResult> {
  if (input.state !== input.storedState) {
    throw new Error('GSC OAuth state mismatch');
  }

  const tokens = await googleGscClient(deps.config).validateAuthorizationCode(
    input.code,
    input.codeVerifier
  );

  const accessToken = tokens.accessToken();
  const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : null;
  const accessTokenExpiresAt = tokens.accessTokenExpiresAt();

  if (!refreshToken) {
    throw new Error('No refresh token returned from Google GSC OAuth');
  }

  const db = deps.db;
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, organizationId: true },
  });

  if (!project) {
    throw new Error('Project not found for GSC connection');
  }

  await db.gscConnection.upsert({
    where: { projectId: input.projectId },
    create: {
      projectId: input.projectId,
      accessToken: encrypt(deps.config.encryptionKey, accessToken),
      refreshToken: encrypt(deps.config.encryptionKey, refreshToken),
      accessTokenExpiresAt,
      siteUrl: '',
    },
    update: {
      accessToken: encrypt(deps.config.encryptionKey, accessToken),
      refreshToken: encrypt(deps.config.encryptionKey, refreshToken),
      accessTokenExpiresAt,
      lastSyncStatus: null,
      lastSyncError: null,
    },
  });

  return { organizationId: project.organizationId };
}

// ---------------------------------------------------------------------------
// `ctx.services.gsc` binding.
// ---------------------------------------------------------------------------

/** A module function's signature with its leading `ServiceDeps` dropped —
 *  what `createGscService` exposes once it has closed over its own. */
type WithoutDeps<T extends (deps: ServiceDeps, ...args: never[]) => unknown> =
  T extends (deps: ServiceDeps, ...args: infer A) => infer R
    ? (...args: A) => R
    : never;

/** `ctx.services.gsc` — a thin binding of the functions above to a Ctx's logger/queues. */
export function createGscService(deps: ServiceDeps, _services: () => Services) {
  const logger = deps.logger.child({ module: 'gsc' });

  const getOverview: WithoutDeps<typeof getGscOverview> = (...args) =>
    getGscOverview(deps, ...args);
  const getPreviousOverview: WithoutDeps<typeof getGscPreviousOverview> = (
    ...args
  ) => getGscPreviousOverview(deps, ...args);
  const getPages: WithoutDeps<typeof getGscPages> = (...args) =>
    getGscPages(deps, ...args);
  const getPageDetails: WithoutDeps<typeof getGscPageDetails> = (...args) =>
    getGscPageDetails(deps, ...args);
  const getQueryDetails: WithoutDeps<typeof getGscQueryDetails> = (...args) =>
    getGscQueryDetails(deps, ...args);
  const getQueries: WithoutDeps<typeof getGscQueries> = (...args) =>
    getGscQueries(deps, ...args);
  const getSearchEngines: WithoutDeps<typeof getGscSearchEngines> = (...args) =>
    getGscSearchEngines(deps, ...args);
  const getAiEngines: WithoutDeps<typeof getGscAiEngines> = (...args) =>
    getGscAiEngines(deps, ...args);

  return {
    getConnection: (projectId: string): Promise<GscConnectionSummary | null> =>
      getGscConnection(deps, projectId),
    listSites: (projectId: string): Promise<GscSite[]> =>
      listGscSites(deps, projectId),
    /** Also enqueues the `gscProjectBackfill` job. */
    selectSite: async (projectId: string, siteUrl: string): Promise<void> => {
      await selectGscSite(deps, projectId, siteUrl);
      await deps.queues.gsc.gscProjectBackfill.add({ projectId });
    },
    disconnect: (projectId: string): Promise<void> =>
      disconnectGscConnection(deps, projectId),
    resolveDateRange: (
      projectId: string,
      input: GscDateRangeInput
    ): ReturnType<typeof resolveGscDateRange> =>
      resolveGscDateRange(deps, projectId, input),
    getOverview,
    getPreviousOverview,
    getPages,
    getPageDetails,
    getQueryDetails,
    getQueries,
    getSearchEngines,
    getAiEngines,
    getCannibalization: (
      projectId: string,
      startDate: string,
      endDate: string
    ): Promise<GscCannibalizedQuery[]> =>
      getGscCannibalization(deps, projectId, startDate, endDate),
    listConnectionsForSync: (): Promise<{ projectId: string }[]> =>
      listGscConnectionsForSync(deps),
    runProjectSync: (projectId: string): Promise<void> =>
      runGscProjectSync(deps, projectId, logger),
    runProjectBackfill: (projectId: string): Promise<void> =>
      runGscProjectBackfill(deps, projectId, logger),
  };
}
