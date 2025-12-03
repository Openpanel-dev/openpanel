import { TABLE_NAMES, ch } from '../src/clickhouse/client';
import { clix } from '../src/clickhouse/query-builder';

const START_DATE = new Date('2025-11-10T00:00:00Z');
const END_DATE = new Date('2025-11-20T23:00:00Z');
const SESSIONS_PER_HOUR = 2;

// Revenue between $10 (1000 cents) and $200 (20000 cents)
const MIN_REVENUE = 1000;
const MAX_REVENUE = 20000;

function getRandomRevenue() {
  return (
    Math.floor(Math.random() * (MAX_REVENUE - MIN_REVENUE + 1)) + MIN_REVENUE
  );
}

async function main() {
  console.log(
    `Starting revenue update for sessions between ${START_DATE.toISOString()} and ${END_DATE.toISOString()}`,
  );

  let currentDate = new Date(START_DATE);

  while (currentDate < END_DATE) {
    const nextHour = new Date(currentDate.getTime() + 60 * 60 * 1000);
    console.log(`Processing hour: ${currentDate.toISOString()}`);

    // 1. Pick random sessions for this hour
    const sessions = await clix(ch)
      .from(TABLE_NAMES.sessions)
      .select(['id'])
      .where('created_at', '>=', currentDate)
      .andWhere('created_at', '<', nextHour)
      .where('project_id', '=', 'public-web')
      .limit(SESSIONS_PER_HOUR)
      .execute();

    if (sessions.length === 0) {
      console.log(`No sessions found for ${currentDate.toISOString()}`);
      currentDate = nextHour;
      continue;
    }

    const sessionIds = sessions.map((s: any) => s.id);
    console.log(
      `Found ${sessionIds.length} sessions to update: ${sessionIds.join(', ')}`,
    );

    // 2. Construct update query
    // We want to assign a DIFFERENT random revenue to each session
    // Query: ALTER TABLE sessions UPDATE revenue = if(id='id1', rev1, if(id='id2', rev2, ...)) WHERE id IN ('id1', 'id2', ...)

    const updates: { id: string; revenue: number }[] = [];

    for (const id of sessionIds) {
      const revenue = getRandomRevenue();
      updates.push({ id, revenue });
    }

    // Build nested if() for the update expression
    // ClickHouse doesn't have CASE WHEN in UPDATE expression in the same way, but if() works.
    // Actually multiIf is cleaner: multiIf(id='id1', rev1, id='id2', rev2, revenue)

    const conditions = updates
      .map((u) => `id = '${u.id}', ${u.revenue}`)
      .join(', ');
    const updateExpr = `multiIf(${conditions}, revenue)`;

    const idsStr = sessionIds.map((id: string) => `'${id}'`).join(', ');
    const query = `ALTER TABLE ${TABLE_NAMES.sessions} UPDATE revenue = ${updateExpr} WHERE id IN (${idsStr})`;

    console.log(`Executing update: ${query}`);

    try {
      await ch.command({
        query,
      });
      console.log('Update command sent.');

      // Wait a bit to not overload mutations if running on a large range
      await new Promise((resolve) => setTimeout(resolve, 500));
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
