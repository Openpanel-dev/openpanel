// The pre-engine insight detector, kept for V1 parity — no live callers today.
//
// The ten statements moved off clix onto the ADR-013 `sql` tag. The conversion
// changes how values reach the server and nothing else: every statement below
// renders byte-identically to the clix output it replaces, with the project id
// and the computed window bound as `{pN:Type}` params. clix always sent
// `session_timezone` (query-builder.ts:562) and defaulted it to `'UTC'`
// (`:696`), so `chQuery` sends the same value.
//
// Nine of the ten statements are BROKEN AND WERE ALWAYS BROKEN. clix's
// `having(column, operator, value)` escaped its comparand as a VALUE, so every
// `'<column> * <n>'` threshold below reaches ClickHouse as a quoted string and
// the comparison fails with TYPE_MISMATCH; three more read columns (`is_new`,
// `is_returning`, `event_name`, `status`) that no OpenPanel table has, and one
// puts a window function in HAVING. The defects are reproduced verbatim, not
// fixed: a conversion changes binding, not behaviour, and fixing them is a
// product decision with no caller to serve.

import {
  type SqlFragment,
  type SqlParam,
  sql,
} from '@openpanel/db/src/clickhouse/sql';
import { type ChScope, chQuery } from '../../../ch-query';
import { formatClickhouseDate } from '../../../shared/ch-dates';

/** clix sent `session_timezone` on every `execute()`, defaulting to `'UTC'`. */
const CLIX_SESSION_TIMEZONE = { session_timezone: 'UTC' } as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const TRAFFIC_SPIKE_WINDOW_DAYS = 30;
const EVENT_SURGE_WINDOW_DAYS = 30;
const NEW_VISITOR_WINDOW_DAYS = 60;
const REFERRAL_SOURCE_WINDOW_DAYS = 7;
const SESSION_DURATION_WINDOW_DAYS = 14;
const TOP_CONTENT_WINDOW_DAYS = 30;
const BOUNCE_RATE_WINDOW_DAYS = 60;
const RETURNING_VISITOR_WINDOW_DAYS = 180;
const GEOGRAPHIC_SHIFT_WINDOW_DAYS = 14;
const EVENT_COMPLETION_WINDOW_DAYS = 60;

const TOP_CONTENT_LIMIT = 1;

// clix rendered each of these as a quoted STRING comparand, because they were
// passed to `having()` as values. Kept exactly, defect included.
const TRAFFIC_SPIKE_THRESHOLD = 'avg_previous_7_days * 2';
const EVENT_SURGE_THRESHOLD = 'avg_previous_7_days * 1.3';
const NEW_VISITOR_THRESHOLD = 'prev_month_visitors * 1.2';
const SESSION_DURATION_THRESHOLD = 'prev_week_duration * 1.25';
const BOUNCE_RATE_THRESHOLD = 'prev_month_bounce_rate * 0.85';
const RETURNING_VISITOR_THRESHOLD = 'prev_quarter_visitors * 1.1';
const GEOGRAPHIC_SHIFT_THRESHOLD = 'prev_week_count * 1.5';
const EVENT_COMPLETION_THRESHOLD = 'prev_month_count * 1.05';
const REFERRAL_SOURCE_MIN_SHARE = 0.5;

const COMPLETED_EVENT_STATUS = 'completed';

/** Whatever the detector that produced the insight selected. Three of the ten
 *  shapes carry no date-ish column at all — see `insightPeriod`. */
export type LegacyInsightData =
  | TrafficSpikeResult
  | EventSurgeResult
  | NewVisitorTrendResult
  | ReferralSourceResult
  | SessionDurationResult
  | TopContentResult
  | BounceRateResult
  | ReturningVisitorResult
  | GeographicShiftResult
  | EventCompletionResult;

export interface Insight {
  type: string;
  message: string;
  data: LegacyInsightData;
}

/** The one period column a result shape carries, or '' for the shapes that
 *  carry none — those sort last, as an Invalid Date always has. */
function insightPeriod(data: LegacyInsightData): string {
  const periods = data as Partial<
    Record<'date' | 'month' | 'week' | 'quarter', string>
  >;
  return periods.date || periods.month || periods.week || periods.quarter || '';
}

interface TrafficSpikeResult {
  referrer_name: string;
  date: string;
  visitor_count: number;
  avg_previous_7_days: number;
}

interface EventSurgeResult {
  date: string;
  event_count: number;
  avg_previous_7_days: number;
}

interface NewVisitorTrendResult {
  month: string;
  new_visitors: number;
  prev_month_visitors: number;
}

interface ReferralSourceResult {
  referrer_name: string;
  count: number;
  percentage: number;
}

interface SessionDurationResult {
  week: string;
  avg_duration: number;
  prev_week_duration: number;
}

interface TopContentResult {
  path: string;
  view_count: number;
  unique_viewers: number;
}

interface BounceRateResult {
  month: string;
  bounce_rate: number;
  prev_month_bounce_rate: number;
}

interface ReturningVisitorResult {
  quarter: string;
  returning_visitors: number;
  prev_quarter_visitors: number;
}

interface GeographicShiftResult {
  country: string;
  visitor_count: number;
  prev_week_count: number;
}

interface EventCompletionResult {
  event_name: string;
  month: string;
  completion_count: number;
  prev_month_count: number;
}

/** clix escaped a `Date` value to `'YYYY-MM-DD HH:mm:ss'` (query-builder.ts:286). */
function since(days: number): SqlParam {
  return sql.string(
    formatClickhouseDate(new Date(Date.now() - days * MS_PER_DAY))
  );
}

/**
 * The pre-engine detector, kept for V1 parity — no live callers today.
 *
 * The class is no longer exported; `createLegacyInsightsScanner(deps)` below is
 * the module's factory, so every service module in core is reached the same way
 * and nothing in the tree still exports a `*Service` class.
 */
class LegacyInsightsScanner {
  constructor(private readonly deps: ChScope) {}

  private run<T extends object>(statement: SqlFragment): Promise<T[]> {
    return chQuery<T>(this.deps, statement, CLIX_SESSION_TIMEZONE);
  }

  private async getTrafficSpikes(projectId: string): Promise<Insight[]> {
    const results = await this.run<TrafficSpikeResult>(
      sql`SELECT referrer_name, toDate(created_at) as date, COUNT(*) as visitor_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= ${since(TRAFFIC_SPIKE_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} GROUP BY referrer_name, date HAVING visitor_count > ${sql.string(TRAFFIC_SPIKE_THRESHOLD)} ORDER BY visitor_count DESC`
    );
    return results.map((result) => ({
      type: 'traffic_spike',
      message: `Your website experienced a significant increase in visitors from ${result.referrer_name} on ${result.date}.`,
      data: result,
    }));
  }

  private async getEventSurges(projectId: string): Promise<Insight[]> {
    const results = await this.run<EventSurgeResult>(
      sql`SELECT toDate(created_at) as date, COUNT(*) as event_count, avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days FROM events WHERE created_at >= ${since(EVENT_SURGE_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} GROUP BY date HAVING event_count > ${sql.string(EVENT_SURGE_THRESHOLD)} ORDER BY event_count DESC`
    );
    return results.map((result) => ({
      type: 'event_surge',
      message: `There was a surge in events recorded on ${result.date}, marking a ${Math.round((result.event_count / result.avg_previous_7_days - 1) * 100)}% increase from the previous average.`,
      data: result,
    }));
  }

  private async getNewVisitorTrends(projectId: string): Promise<Insight[]> {
    const results = await this.run<NewVisitorTrendResult>(
      sql`SELECT toMonth(created_at) as month, COUNT(DISTINCT device_id) as new_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY month) as prev_month_visitors FROM sessions WHERE created_at >= ${since(NEW_VISITOR_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} AND is_new = true GROUP BY month HAVING new_visitors > ${sql.string(NEW_VISITOR_THRESHOLD)} ORDER BY month DESC`
    );
    return results.map((result) => ({
      type: 'new_visitor_trend',
      message: `This month, you saw a ${Math.round((result.new_visitors / result.prev_month_visitors - 1) * 100)}% increase in new visitors compared to last month.`,
      data: result,
    }));
  }

  private async getReferralSourceHighlights(
    projectId: string
  ): Promise<Insight[]> {
    const results = await this.run<ReferralSourceResult>(
      sql`SELECT referrer_name, COUNT(*) as count, COUNT(*) / sum(COUNT(*)) OVER () as percentage FROM sessions WHERE created_at >= ${since(REFERRAL_SOURCE_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} GROUP BY referrer_name HAVING percentage >= ${sql.float64(REFERRAL_SOURCE_MIN_SHARE)} ORDER BY count DESC`
    );
    return results.map((result) => ({
      type: 'referral_source',
      message: `${result.referrer_name} was your top referral source this week, contributing to ${Math.round(result.percentage * 100)}% of the total traffic.`,
      data: result,
    }));
  }

  private async getSessionDurationChanges(
    projectId: string
  ): Promise<Insight[]> {
    const results = await this.run<SessionDurationResult>(
      sql`SELECT toWeek(created_at) as week, avg(duration) as avg_duration, lag(avg(duration)) OVER (ORDER BY week) as prev_week_duration FROM sessions WHERE created_at >= ${since(SESSION_DURATION_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} GROUP BY week HAVING avg_duration > ${sql.string(SESSION_DURATION_THRESHOLD)} ORDER BY week DESC`
    );
    return results.map((result) => ({
      type: 'session_duration',
      message: `Users spent ${Math.round((result.avg_duration / result.prev_week_duration - 1) * 100)}% more time on average per session this week compared to last week.`,
      data: result,
    }));
  }

  private async getTopPerformingContent(projectId: string): Promise<Insight[]> {
    const results = await this.run<TopContentResult>(
      sql`SELECT path, COUNT(*) as view_count, COUNT(DISTINCT device_id) as unique_viewers FROM events WHERE created_at >= ${since(TOP_CONTENT_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} GROUP BY path ORDER BY view_count DESC LIMIT ${sql.uint64(TOP_CONTENT_LIMIT)}`
    );
    return results.map((result) => ({
      type: 'top_content',
      message: `Your content at "${result.path}" was the most viewed content this month with ${result.view_count} views from ${result.unique_viewers} unique viewers.`,
      data: result,
    }));
  }

  private async getBounceRateImprovements(
    projectId: string
  ): Promise<Insight[]> {
    const results = await this.run<BounceRateResult>(
      sql`SELECT toMonth(created_at) as month, sum(is_bounce) / COUNT(*) as bounce_rate, lag(sum(is_bounce) / COUNT(*)) OVER (ORDER BY month) as prev_month_bounce_rate FROM sessions WHERE created_at >= ${since(BOUNCE_RATE_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} GROUP BY month HAVING bounce_rate < ${sql.string(BOUNCE_RATE_THRESHOLD)} ORDER BY month DESC`
    );
    return results.map((result) => ({
      type: 'bounce_rate',
      message: `The bounce rate decreased by ${Math.round((1 - result.bounce_rate / result.prev_month_bounce_rate) * 100)}% this month, indicating more engaging content.`,
      data: result,
    }));
  }

  private async getReturningVisitorTrends(
    projectId: string
  ): Promise<Insight[]> {
    const results = await this.run<ReturningVisitorResult>(
      sql`SELECT toQuarter(created_at) as quarter, COUNT(DISTINCT device_id) as returning_visitors, lag(COUNT(DISTINCT device_id)) OVER (ORDER BY quarter) as prev_quarter_visitors FROM sessions WHERE created_at >= ${since(RETURNING_VISITOR_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} AND is_returning = true GROUP BY quarter HAVING returning_visitors > ${sql.string(RETURNING_VISITOR_THRESHOLD)} ORDER BY quarter DESC`
    );
    return results.map((result) => ({
      type: 'returning_visitors',
      message: `Returning visitors increased by ${Math.round((result.returning_visitors / result.prev_quarter_visitors - 1) * 100)}% this quarter, showing growing user loyalty.`,
      data: result,
    }));
  }

  private async getGeographicInterestShifts(
    projectId: string
  ): Promise<Insight[]> {
    const results = await this.run<GeographicShiftResult>(
      sql`SELECT country, COUNT(*) as visitor_count, lag(COUNT(*)) OVER (ORDER BY toWeek(created_at)) as prev_week_count FROM sessions WHERE created_at >= ${since(GEOGRAPHIC_SHIFT_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} GROUP BY country, toWeek(created_at) HAVING visitor_count > ${sql.string(GEOGRAPHIC_SHIFT_THRESHOLD)} ORDER BY visitor_count DESC`
    );
    return results.map((result) => ({
      type: 'geographic_shift',
      message: `There was a noticeable increase in traffic from ${result.country} this week.`,
      data: result,
    }));
  }

  private async getEventCompletionChanges(
    projectId: string
  ): Promise<Insight[]> {
    const results = await this.run<EventCompletionResult>(
      sql`SELECT event_name, toMonth(created_at) as month, COUNT(*) as completion_count, lag(COUNT(*)) OVER (ORDER BY month) as prev_month_count FROM events WHERE created_at >= ${since(EVENT_COMPLETION_WINDOW_DAYS)} AND project_id = ${sql.string(projectId)} AND status = ${sql.string(COMPLETED_EVENT_STATUS)} GROUP BY event_name, month HAVING completion_count > ${sql.string(EVENT_COMPLETION_THRESHOLD)} ORDER BY month DESC`
    );
    return results.map((result) => ({
      type: 'event_completion',
      message: `The completion rate for your "${result.event_name}" event increased by ${Math.round((result.completion_count / result.prev_month_count - 1) * 100)}% this month.`,
      data: result,
    }));
  }

  async generateInsights(projectId: string): Promise<Insight[]> {
    const [
      trafficSpikes,
      eventSurges,
      newVisitorTrends,
      referralSources,
      sessionDurations,
      topContent,
      bounceRates,
      returningVisitors,
      geographicShifts,
      eventCompletions,
    ] = await Promise.all([
      this.getTrafficSpikes(projectId),
      this.getEventSurges(projectId),
      this.getNewVisitorTrends(projectId),
      this.getReferralSourceHighlights(projectId),
      this.getSessionDurationChanges(projectId),
      this.getTopPerformingContent(projectId),
      this.getBounceRateImprovements(projectId),
      this.getReturningVisitorTrends(projectId),
      this.getGeographicInterestShifts(projectId),
      this.getEventCompletionChanges(projectId),
    ]);

    return [
      ...trafficSpikes,
      ...eventSurges,
      ...newVisitorTrends,
      ...referralSources,
      ...sessionDurations,
      ...topContent,
      ...bounceRates,
      ...returningVisitors,
      ...geographicShifts,
      ...eventCompletions,
    ].sort((a, b) => {
      // Sort by most recent data first
      const dateA = new Date(insightPeriod(a.data));
      const dateB = new Date(insightPeriod(b.data));
      return dateB.getTime() - dateA.getTime();
    });
  }
}

export function createLegacyInsightsScanner(deps: ChScope) {
  const scanner = new LegacyInsightsScanner(deps);
  return {
    generateInsights: (projectId: string): Promise<Insight[]> =>
      scanner.generateInsights(projectId),
  };
}
