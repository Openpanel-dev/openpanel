import type { ClickHouseClient } from '@clickhouse/client';
import { clix } from '../clickhouse/query-builder';

export interface Insight {
  type: string;
  message: string;
  data: any;
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

export class InsightsService {
  constructor(private client: ClickHouseClient) {}

  private async getTrafficSpikes(projectId: string): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'referrer_name',
        'toDate(created_at) as date',
        'COUNT(*) as visitor_count',
        'avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days',
      ])
      .from('events')
      .where(
        'created_at',
        '>=',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      )
      .where('project_id', '=', projectId)
      .groupBy(['referrer_name', 'date'])
      .having('visitor_count', '>', 'avg_previous_7_days * 2')
      .orderBy('visitor_count', 'DESC');

    const results = await query.execute();
    return (results as TrafficSpikeResult[]).map((result) => ({
      type: 'traffic_spike',
      message: `Your website experienced a significant increase in visitors from ${result.referrer_name} on ${result.date}.`,
      data: result,
    }));
  }

  private async getEventSurges(projectId: string): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'toDate(created_at) as date',
        'COUNT(*) as event_count',
        'avg(COUNT(*)) OVER (ORDER BY date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_previous_7_days',
      ])
      .from('events')
      .where(
        'created_at',
        '>=',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      )
      .where('project_id', '=', projectId)
      .groupBy(['date'])
      .having('event_count', '>', 'avg_previous_7_days * 1.3')
      .orderBy('event_count', 'DESC');

    const results = await query.execute();
    return (results as EventSurgeResult[]).map((result) => ({
      type: 'event_surge',
      message: `There was a surge in events recorded on ${result.date}, marking a ${Math.round((result.event_count / result.avg_previous_7_days - 1) * 100)}% increase from the previous average.`,
      data: result,
    }));
  }

  private async getNewVisitorTrends(projectId: string): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'toMonth(created_at) as month',
        'COUNT(DISTINCT device_id) as new_visitors',
        'lag(COUNT(DISTINCT device_id)) OVER (ORDER BY month) as prev_month_visitors',
      ])
      .from('sessions')
      .where(
        'created_at',
        '>=',
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      )
      .where('project_id', '=', projectId)
      .where('is_new', '=', true)
      .groupBy(['month'])
      .having('new_visitors', '>', 'prev_month_visitors * 1.2')
      .orderBy('month', 'DESC');

    const results = await query.execute();
    return (results as NewVisitorTrendResult[]).map((result) => ({
      type: 'new_visitor_trend',
      message: `This month, you saw a ${Math.round((result.new_visitors / result.prev_month_visitors - 1) * 100)}% increase in new visitors compared to last month.`,
      data: result,
    }));
  }

  private async getReferralSourceHighlights(
    projectId: string,
  ): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'referrer_name',
        'COUNT(*) as count',
        'COUNT(*) / sum(COUNT(*)) OVER () as percentage',
      ])
      .from('sessions')
      .where('created_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .where('project_id', '=', projectId)
      .groupBy(['referrer_name'])
      .having('percentage', '>=', 0.5)
      .orderBy('count', 'DESC');

    const results = await query.execute();
    return (results as ReferralSourceResult[]).map((result) => ({
      type: 'referral_source',
      message: `${result.referrer_name} was your top referral source this week, contributing to ${Math.round(result.percentage * 100)}% of the total traffic.`,
      data: result,
    }));
  }

  private async getSessionDurationChanges(
    projectId: string,
  ): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'toWeek(created_at) as week',
        'avg(duration) as avg_duration',
        'lag(avg(duration)) OVER (ORDER BY week) as prev_week_duration',
      ])
      .from('sessions')
      .where(
        'created_at',
        '>=',
        new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      )
      .where('project_id', '=', projectId)
      .groupBy(['week'])
      .having('avg_duration', '>', 'prev_week_duration * 1.25')
      .orderBy('week', 'DESC');

    const results = await query.execute();
    return (results as SessionDurationResult[]).map((result) => ({
      type: 'session_duration',
      message: `Users spent ${Math.round((result.avg_duration / result.prev_week_duration - 1) * 100)}% more time on average per session this week compared to last week.`,
      data: result,
    }));
  }

  private async getTopPerformingContent(projectId: string): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'path',
        'COUNT(*) as view_count',
        'COUNT(DISTINCT device_id) as unique_viewers',
      ])
      .from('events')
      .where(
        'created_at',
        '>=',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      )
      .where('project_id', '=', projectId)
      .groupBy(['path'])
      .orderBy('view_count', 'DESC')
      .limit(1);

    const results = await query.execute();
    return (results as TopContentResult[]).map((result) => ({
      type: 'top_content',
      message: `Your content at "${result.path}" was the most viewed content this month with ${result.view_count} views from ${result.unique_viewers} unique viewers.`,
      data: result,
    }));
  }

  private async getBounceRateImprovements(
    projectId: string,
  ): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'toMonth(created_at) as month',
        'sum(is_bounce) / COUNT(*) as bounce_rate',
        'lag(sum(is_bounce) / COUNT(*)) OVER (ORDER BY month) as prev_month_bounce_rate',
      ])
      .from('sessions')
      .where(
        'created_at',
        '>=',
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      )
      .where('project_id', '=', projectId)
      .groupBy(['month'])
      .having('bounce_rate', '<', 'prev_month_bounce_rate * 0.85')
      .orderBy('month', 'DESC');

    const results = await query.execute();
    return (results as BounceRateResult[]).map((result) => ({
      type: 'bounce_rate',
      message: `The bounce rate decreased by ${Math.round((1 - result.bounce_rate / result.prev_month_bounce_rate) * 100)}% this month, indicating more engaging content.`,
      data: result,
    }));
  }

  private async getReturningVisitorTrends(
    projectId: string,
  ): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'toQuarter(created_at) as quarter',
        'COUNT(DISTINCT device_id) as returning_visitors',
        'lag(COUNT(DISTINCT device_id)) OVER (ORDER BY quarter) as prev_quarter_visitors',
      ])
      .from('sessions')
      .where(
        'created_at',
        '>=',
        new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
      )
      .where('project_id', '=', projectId)
      .where('is_returning', '=', true)
      .groupBy(['quarter'])
      .having('returning_visitors', '>', 'prev_quarter_visitors * 1.1')
      .orderBy('quarter', 'DESC');

    const results = await query.execute();
    return (results as ReturningVisitorResult[]).map((result) => ({
      type: 'returning_visitors',
      message: `Returning visitors increased by ${Math.round((result.returning_visitors / result.prev_quarter_visitors - 1) * 100)}% this quarter, showing growing user loyalty.`,
      data: result,
    }));
  }

  private async getGeographicInterestShifts(
    projectId: string,
  ): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'country',
        'COUNT(*) as visitor_count',
        'lag(COUNT(*)) OVER (ORDER BY toWeek(created_at)) as prev_week_count',
      ])
      .from('sessions')
      .where(
        'created_at',
        '>=',
        new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      )
      .where('project_id', '=', projectId)
      .groupBy(['country', 'toWeek(created_at)'])
      .having('visitor_count', '>', 'prev_week_count * 1.5')
      .orderBy('visitor_count', 'DESC');

    const results = await query.execute();
    return (results as GeographicShiftResult[]).map((result) => ({
      type: 'geographic_shift',
      message: `There was a noticeable increase in traffic from ${result.country} this week.`,
      data: result,
    }));
  }

  private async getEventCompletionChanges(
    projectId: string,
  ): Promise<Insight[]> {
    const query = clix(this.client)
      .select([
        'event_name',
        'toMonth(created_at) as month',
        'COUNT(*) as completion_count',
        'lag(COUNT(*)) OVER (ORDER BY month) as prev_month_count',
      ])
      .from('events')
      .where(
        'created_at',
        '>=',
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      )
      .where('project_id', '=', projectId)
      .where('status', '=', 'completed')
      .groupBy(['event_name', 'month'])
      .having('completion_count', '>', 'prev_month_count * 1.05')
      .orderBy('month', 'DESC');

    const results = await query.execute();
    return (results as EventCompletionResult[]).map((result) => ({
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
      const dateA = new Date(
        a.data.date || a.data.month || a.data.week || a.data.quarter,
      );
      const dateB = new Date(
        b.data.date || b.data.month || b.data.week || b.data.quarter,
      );
      return dateB.getTime() - dateA.getTime();
    });
  }
}
