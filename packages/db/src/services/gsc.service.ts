import { getGscCannibalization, getGscOverview, getGscPageDetails, getGscPages, getGscQueryDetails, getGscQueries } from '../gsc';

export interface GscQueryOpportunity {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  opportunity_score: number;
  reason: string;
}

function computeOpportunities(
  queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>,
): GscQueryOpportunity[] {
  const ctrBenchmarks: Record<string, number> = {
    '1': 0.28,
    '2': 0.15,
    '3': 0.11,
    '4-6': 0.065,
    '7-10': 0.035,
    '11-20': 0.012,
  };

  function getBenchmark(position: number): number {
    if (position <= 1) return ctrBenchmarks['1'] ?? 0.28;
    if (position <= 2) return ctrBenchmarks['2'] ?? 0.15;
    if (position <= 3) return ctrBenchmarks['3'] ?? 0.11;
    if (position <= 6) return ctrBenchmarks['4-6'] ?? 0.065;
    if (position <= 10) return ctrBenchmarks['7-10'] ?? 0.035;
    return ctrBenchmarks['11-20'] ?? 0.012;
  }

  return queries
    .filter((q) => q.position >= 4 && q.position <= 20 && q.impressions >= 50)
    .map((q) => {
      const benchmark = getBenchmark(q.position);
      const ctrGap = Math.max(0, benchmark - q.ctr);
      const opportunity_score =
        Math.round(q.impressions * (1 / q.position) * (1 + ctrGap) * 100) /
        100;

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
        ctr: Math.round(q.ctr * 10000) / 100,
        position: Math.round(q.position * 10) / 10,
        opportunity_score,
        reason,
      };
    })
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, 50);
}

export async function gscGetOverviewCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  interval?: 'day' | 'week' | 'month';
}) {
  const data = await getGscOverview(
    input.projectId,
    input.startDate,
    input.endDate,
    input.interval ?? 'day',
  );
  return {
    data,
    summary: {
      total_clicks: data.reduce((s, r) => s + r.clicks, 0),
      total_impressions: data.reduce((s, r) => s + r.impressions, 0),
      avg_ctr:
        data.length > 0
          ? Math.round(
              (data.reduce((s, r) => s + r.ctr, 0) / data.length) * 10000,
            ) / 100
          : 0,
      avg_position:
        data.length > 0
          ? Math.round(
              (data.reduce((s, r) => s + r.position, 0) / data.length) * 10,
            ) / 10
          : 0,
    },
  };
}

export async function gscGetTopPagesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}) {
  return getGscPages(
    input.projectId,
    input.startDate,
    input.endDate,
    input.limit ?? 100,
  );
}

export async function gscGetPageDetailsCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  page: string;
}) {
  return getGscPageDetails(
    input.projectId,
    input.page,
    input.startDate,
    input.endDate,
  );
}

export async function gscGetTopQueriesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}) {
  return getGscQueries(
    input.projectId,
    input.startDate,
    input.endDate,
    input.limit ?? 100,
  );
}

export async function gscGetQueryOpportunitiesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  minImpressions?: number;
}) {
  const queries = await getGscQueries(
    input.projectId,
    input.startDate,
    input.endDate,
    5000,
  );
  const filtered = queries.filter(
    (q) => q.impressions >= (input.minImpressions ?? 50),
  );
  const opportunities = computeOpportunities(filtered);
  return {
    opportunities,
    total_analyzed: filtered.length,
    min_impressions: input.minImpressions ?? 50,
  };
}

export async function gscGetQueryDetailsCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  query: string;
}) {
  return getGscQueryDetails(
    input.projectId,
    input.query,
    input.startDate,
    input.endDate,
  );
}

export async function gscGetCannibalizationCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  return getGscCannibalization(
    input.projectId,
    input.startDate,
    input.endDate,
  );
}
