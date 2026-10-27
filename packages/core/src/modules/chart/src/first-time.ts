// "First time for user": a series that counts only the occurrence each user
// did first, ever. The first occurrence is taken over the user's whole
// history, not the reported period, so someone who did the event before the
// period never counts inside it.
//
// The condition only admits that first row; the outer scan's filters then
// decide whether it counts. A user whose first occurrence fails a filter is
// not counted at a later, matching one, which is what Mixpanel's and
// PostHog's "first time" qualifier mean.
//
// Cluster note: `events` is Distributed on Cloud, so the set is `GLOBAL IN`,
// built once on the initiator over every shard. A per-shard `IN` would take
// each shard's own minimum, which is not the user's first occurrence.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type { IChartEvent } from '../../report/report.constants';
import { eventMatchCondition } from './event-match';
import { CHART_TABLE } from './field-resolution';

export type FirstTimeEvent = Pick<IChartEvent, 'name' | 'anyOf' | 'firstTime'>;

const FIRST_SEEN = sql`first_seen`;

export interface FirstOccurrencePeriod {
  /** Bounds the history scan: a later row cannot be a first occurrence inside the period. */
  scanUntil?: SqlFragment;
  /** Whether a first occurrence at `firstSeen` falls inside the period. */
  contains: (firstSeen: SqlFragment) => SqlFragment;
}

/**
 * A `[startDate, endDate]` period. The dates bind as given, so pass the same
 * literals the caller's own date range binds.
 */
export function rangePeriod(
  startDate: string,
  endDate: string
): FirstOccurrencePeriod {
  return {
    scanUntil: sql`created_at <= toDateTime(${sql.string(endDate)})`,
    contains: (firstSeen) =>
      sql`${firstSeen} >= toDateTime(${sql.string(startDate)})`,
  };
}

/**
 * Restricts an events scan to each user's first occurrence of the series'
 * event, or null when the series does not ask for it. `eventsAlias` names the
 * outer scan's events table.
 */
export function firstTimeCondition({
  event,
  projectId,
  eventsAlias,
  period,
}: {
  event: FirstTimeEvent;
  projectId: string;
  eventsAlias: string;
  period: FirstOccurrencePeriod;
}): SqlFragment | null {
  if (!event.firstTime) {
    return null;
  }
  const eventMatch = eventMatchCondition(event, projectId);
  // The any-event series would read every event in the project's history,
  // so it is not offered.
  if (!eventMatch) {
    return null;
  }

  const scan = [sql`project_id = ${sql.string(projectId)}`, eventMatch];
  if (period.scanUntil) {
    scan.push(period.scanUntil);
  }
  const outerRow = sql`(${sql.id(`${eventsAlias}.profile_id`)}, ${sql.id(`${eventsAlias}.created_at`)})`;
  return sql`${outerRow} GLOBAL IN (SELECT profile_id, min(created_at) AS ${FIRST_SEEN} FROM ${sql.id(CHART_TABLE.events)} WHERE ${sql.join(scan, ' AND ')} GROUP BY profile_id HAVING ${period.contains(FIRST_SEEN)})`;
}
