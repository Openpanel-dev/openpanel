import { originalCh } from './clickhouse/client';
import { db } from './prisma-client';

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

async function refreshGscToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh GSC token: ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  return { accessToken: data.access_token, expiresAt };
}

export async function getGscAccessToken(projectId: string): Promise<string> {
  const conn = await db.gscConnection.findUniqueOrThrow({
    where: { projectId },
  });

  if (
    conn.accessTokenExpiresAt &&
    conn.accessTokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return conn.accessToken;
  }

  const { accessToken, expiresAt } = await refreshGscToken(conn.refreshToken);
  await db.gscConnection.update({
    where: { projectId },
    data: { accessToken, accessTokenExpiresAt: expiresAt },
  });
  return accessToken;
}

export async function listGscSites(projectId: string): Promise<GscSite[]> {
  const accessToken = await getGscAccessToken(projectId);
  const res = await fetch('https://www.googleapis.com/webmaster/v3/sites', {
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

async function queryGscSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[]
): Promise<GscApiRow[]> {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const url = `https://www.googleapis.com/webmaster/v3/sites/${encodedSiteUrl}/searchAnalytics/query`;

  const allRows: GscApiRow[] = [];
  let startRow = 0;
  const rowLimit = 25000;

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
        rowLimit,
        startRow,
        dataState: 'all',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GSC query failed for dimensions [${dimensions.join(',')}]: ${text}`);
    }

    const data = (await res.json()) as { rows?: GscApiRow[] };
    const rows = data.rows ?? [];
    allRows.push(...rows);

    if (rows.length < rowLimit) break;
    startRow += rowLimit;
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
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  const conn = await db.gscConnection.findUniqueOrThrow({
    where: { projectId },
  });

  if (!conn.siteUrl) {
    throw new Error('No GSC site URL configured for this project');
  }

  const accessToken = await getGscAccessToken(projectId);
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  const syncedAt = nowString();

  // 1. Daily totals — authoritative numbers for overview chart
  const dailyRows = await queryGscSearchAnalytics(
    accessToken,
    conn.siteUrl,
    start,
    end,
    ['date']
  );

  if (dailyRows.length > 0) {
    await originalCh.insert({
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
    await originalCh.insert({
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
    await originalCh.insert({
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
  projectId: string,
  startDate: string,
  endDate: string
): Promise<
  Array<{
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>
> {
  const result = await originalCh.query({
    query: `
      SELECT
        date,
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
  const result = await originalCh.query({
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
  });
  return result.json();
}

export async function getGscQueries(
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
  const result = await originalCh.query({
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
  });
  return result.json();
}
