// Local fixture script: give a couple of sessions per hour a random revenue.
import { ch, chQuery, TABLE_NAMES } from '../src/clickhouse/client';
import { sql } from '../src/clickhouse/sql';

const START_DATE = new Date('2025-11-10T00:00:00Z');
const END_DATE = new Date('2025-11-20T23:00:00Z');
const SESSIONS_PER_HOUR = 2;
const PROJECT_ID = 'public-web';
const MS_PER_HOUR = 60 * 60 * 1000;
const PAUSE_BETWEEN_MUTATIONS_MS = 500;

// Revenue between $10 (1000 cents) and $200 (20000 cents)
const MIN_REVENUE = 1000;
const MAX_REVENUE = 20_000;

function getRandomRevenue() {
  return (
    Math.floor(Math.random() * (MAX_REVENUE - MIN_REVENUE + 1)) + MIN_REVENUE
  );
}

/** `YYYY-MM-DD HH:mm:ss` */
function datetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function main() {
  console.log(
    `Starting revenue update for sessions between ${START_DATE.toISOString()} and ${END_DATE.toISOString()}`
  );

  let currentDate = new Date(START_DATE);

  while (currentDate < END_DATE) {
    const nextHour = new Date(currentDate.getTime() + MS_PER_HOUR);
    console.log(`Processing hour: ${currentDate.toISOString()}`);

    const sessions = await chQuery<{ id: string }>(sql`
      SELECT id
      FROM ${sql.id(TABLE_NAMES.sessions)}
      WHERE created_at >= ${sql.string(datetime(currentDate))}
        AND created_at < ${sql.string(datetime(nextHour))}
        AND project_id = ${sql.string(PROJECT_ID)}
      LIMIT ${sql.uint64(SESSIONS_PER_HOUR)}`);

    if (sessions.length === 0) {
      console.log(`No sessions found for ${currentDate.toISOString()}`);
      currentDate = nextHour;
      continue;
    }

    const sessionIds = sessions.map((s) => s.id);
    console.log(
      `Found ${sessionIds.length} sessions to update: ${sessionIds.join(', ')}`
    );

    // 2. Assign a DIFFERENT random revenue to each session. ClickHouse has no
    // CASE WHEN in an UPDATE expression, so multiIf carries the mapping and
    // falls back to the existing `revenue`.
    const updates = sessionIds.map((id) => ({
      id,
      revenue: getRandomRevenue(),
    }));

    const updateExpr = sql`multiIf(${sql.join(
      updates.map(
        (u) => sql`id = ${sql.string(u.id)}, ${sql.float64(u.revenue)}`
      ),
      ', '
    )}, revenue)`;

    const statement =
      sql`ALTER TABLE ${sql.id(TABLE_NAMES.sessions)} UPDATE revenue = ${updateExpr} WHERE id IN ${sql.array('String', sessionIds)}`.toStatement();

    console.log(`Executing update: ${statement.query}`);

    try {
      await ch.command({
        query: statement.query,
        query_params: statement.query_params,
      });
      console.log('Update command sent.');

      // Avoid piling up mutations on a large range.
      await new Promise((resolve) =>
        setTimeout(resolve, PAUSE_BETWEEN_MUTATIONS_MS)
      );
    } catch (error) {
      console.error('Failed to update sessions:', error);
    }

    currentDate = nextHour;
  }

  console.log('Done!');
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
