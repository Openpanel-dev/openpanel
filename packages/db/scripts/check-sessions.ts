// Read-only health check for the session lifecycle pipeline.
//
// Inspects Redis state, the sessions BullMQ queue, both internal buffers,
// and ClickHouse — then reconciles them to surface anything stuck or
// drifting. Safe to run anytime; never mutates state.
//
// Usage:
//   pnpm with-env tsx scripts/check-sessions.ts
//   pnpm with-env tsx scripts/check-sessions.ts --verbose
//   pnpm with-env tsx scripts/check-sessions.ts --project beatchurn-website
//   pnpm with-env tsx scripts/check-sessions.ts --hours 48

import { getSafeJson } from '@openpanel/json';
import { sessionsQueue } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import { ch } from '../src/clickhouse/client';
import type { IClickhouseSession } from '../src/services/session.service';

const DEADMAN_MS = Number.parseInt(
  process.env.SESSION_REAPER_WALLCLOCK_DEADMAN_MS || String(30 * 60 * 1000),
  10
);
const REAPER_INTERVAL_MS = 5 * 60 * 1000;
// "Eligible" = past the deadman, reaper is expected to close shortly.
// "Stuck"   = past 3x reaper interval beyond the deadman — reaper is behind.
const STUCK_GRACE_MS = REAPER_INTERVAL_MS * 3;
const STUCK_CUTOFF_MS = DEADMAN_MS + STUCK_GRACE_MS;
const SAMPLE_SIZE_PER_PROJECT = 100;

type ProjectStat = {
  project: string;
  active: number;
  eligible: number;
  stuck: number;
  orphans: number;
  oldestAgeMin: number;
};

type ChCounts = {
  starts1h: number;
  ends1h: number;
  starts24h: number;
  ends24h: number;
};

function fmt(n: number, w: number) {
  return String(n).padStart(w);
}

function header(title: string) {
  console.log('');
  console.log('─'.repeat(70));
  console.log(title);
  console.log('─'.repeat(70));
}

async function inspectRedis(projects: string[]): Promise<{
  total: number;
  totalEligible: number;
  totalStuck: number;
  totalOrphans: number;
  stats: ProjectStat[];
}> {
  const redis = getRedisCache();
  const now = Date.now();
  const eligibleCutoff = now - DEADMAN_MS;
  const stuckCutoff = now - STUCK_CUTOFF_MS;

  const stats: ProjectStat[] = [];
  let total = 0;
  let totalEligible = 0;
  let totalStuck = 0;
  let totalOrphans = 0;

  for (const project of projects) {
    const wallclockKey = `session:wallclock:${project}`;

    const [active, eligible, stuck, oldestEntry] = await Promise.all([
      redis.zcard(wallclockKey),
      redis.zcount(wallclockKey, '-inf', eligibleCutoff),
      redis.zcount(wallclockKey, '-inf', stuckCutoff),
      redis.zrange(wallclockKey, 0, 0, 'WITHSCORES'),
    ]);

    const oldestAgeMin =
      oldestEntry.length === 2 ? (now - Number(oldestEntry[1])) / 60_000 : 0;

    // Sample N oldest entries and verify their blob exists.
    const sampleSize = Math.min(SAMPLE_SIZE_PER_PROJECT, active);
    let orphans = 0;
    if (sampleSize > 0) {
      const sample = await redis.zrange(wallclockKey, 0, sampleSize - 1);
      const multi = redis.multi();
      for (const did of sample) {
        multi.exists(`session:${project}:${did}`);
      }
      const results = await multi.exec();
      for (const entry of results ?? []) {
        if (Number(entry?.[1] ?? 0) === 0) orphans++;
      }
    }

    stats.push({ project, active, eligible, stuck, orphans, oldestAgeMin });
    total += active;
    totalEligible += eligible;
    totalStuck += stuck;
    totalOrphans += orphans;
  }

  return { total, totalEligible, totalStuck, totalOrphans, stats };
}

async function inspectQueue() {
  const [waiting, delayed, active, failed, completed] = await Promise.all([
    sessionsQueue.getWaitingCount(),
    sessionsQueue.getDelayedCount(),
    sessionsQueue.getActiveCount(),
    sessionsQueue.getFailedCount(),
    sessionsQueue.getCompletedCount(),
  ]);

  const failedSample = failed > 0 ? await sessionsQueue.getFailed(0, 4) : [];

  return { waiting, delayed, active, failed, completed, failedSample };
}

async function inspectBuffers() {
  const redis = getRedisCache();
  const [eventCounter, sessionCounter, eventListLen, sessionListLen] =
    await Promise.all([
      redis.get('buffer-counter:event'),
      redis.get('buffer-counter:session'),
      redis.llen('event-buffer'),
      redis.llen('session-buffer'),
    ]);

  return {
    event: {
      counter: Number(eventCounter ?? 0),
      listLen: Number(eventListLen ?? 0),
    },
    session: {
      counter: Number(sessionCounter ?? 0),
      listLen: Number(sessionListLen ?? 0),
    },
  };
}

async function inspectClickhouse(
  projects: string[] | null,
  hours: number
): Promise<Map<string, ChCounts>> {
  const projectClause = projects?.length
    ? `AND project_id IN (${projects.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')})`
    : '';
  const query = `
    SELECT
      project_id,
      name,
      sum(if(created_at > now() - INTERVAL 1 HOUR, 1, 0)) AS h1,
      sum(if(created_at > now() - INTERVAL ${hours} HOUR, 1, 0)) AS hN
    FROM events
    WHERE name IN ('session_start', 'session_end')
      AND created_at > now() - INTERVAL ${hours} HOUR
      ${projectClause}
    GROUP BY project_id, name
  `;
  const res = await ch.query({ query, format: 'JSONEachRow' });
  const rows = await res.json<{
    project_id: string;
    name: string;
    h1: string;
    hN: string;
  }>();

  const byProject = new Map<string, ChCounts>();
  for (const r of rows) {
    const cur = byProject.get(r.project_id) ?? {
      starts1h: 0,
      ends1h: 0,
      starts24h: 0,
      ends24h: 0,
    };
    if (r.name === 'session_start') {
      cur.starts1h = Number(r.h1);
      cur.starts24h = Number(r.hN);
    } else {
      cur.ends1h = Number(r.h1);
      cur.ends24h = Number(r.hN);
    }
    byProject.set(r.project_id, cur);
  }
  return byProject;
}

async function inspectSessionEndClaims() {
  const redis = getRedisCache();
  let cursor = '0';
  let count = 0;
  do {
    const [next, batch] = await redis.scan(
      cursor,
      'MATCH',
      'session:end:emitted:*',
      'COUNT',
      1000
    );
    cursor = next;
    count += batch.length;
  } while (cursor !== '0' && count < 100_000);
  return count;
}

async function sampleOldestSession(
  projectId: string,
  deviceId: string
): Promise<IClickhouseSession | null> {
  const blob = await getRedisCache().get(`session:${projectId}:${deviceId}`);
  return blob ? getSafeJson<IClickhouseSession>(blob) : null;
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const projectIdx = args.indexOf('--project');
  const projectFilter = projectIdx >= 0 ? args[projectIdx + 1] : null;
  const hoursIdx = args.indexOf('--hours');
  const hours = hoursIdx >= 0 ? Number(args[hoursIdx + 1]) : 24;

  const redis = getRedisCache();

  console.log('═'.repeat(70));
  console.log('SESSION LIFECYCLE HEALTH CHECK');
  console.log(`time:           ${new Date().toISOString()}`);
  console.log(`deadman:        ${DEADMAN_MS / 60_000} min`);
  console.log(`stuck cutoff:   ${STUCK_CUTOFF_MS / 60_000} min (deadman + 3 reaper ticks)`);
  console.log(`ch window:      ${hours}h`);
  if (projectFilter) console.log(`project:        ${projectFilter}`);
  console.log('═'.repeat(70));

  // 1. Redis inventory
  const allProjects = await redis.smembers('session:projects');
  const projects = projectFilter
    ? [projectFilter]
    : allProjects.slice().sort();

  header('REDIS — active sessions');
  console.log(`  ${allProjects.length} projects in session:projects`);

  const redisInfo = await inspectRedis(projects);
  console.log(`  ${redisInfo.total} total active sessions`);
  console.log(`  ${redisInfo.totalEligible} past deadman (expected to reap soon)`);
  console.log(
    `  ${redisInfo.totalStuck} past deadman + ${STUCK_GRACE_MS / 60_000}min (stuck — reaper is behind)`
  );
  console.log(
    `  ${redisInfo.totalOrphans} wallclock entries with no blob (in sampled ${SAMPLE_SIZE_PER_PROJECT}/project)`
  );

  if (verbose && redisInfo.stats.length > 0) {
    console.log('');
    console.log(
      `  ${'project'.padEnd(40)} ${'active'.padStart(8)} ${'eligible'.padStart(10)} ${'stuck'.padStart(8)} ${'orphans'.padStart(8)} ${'oldest'.padStart(10)}`
    );
    for (const s of redisInfo.stats.sort((a, b) => b.active - a.active)) {
      console.log(
        `  ${s.project.padEnd(40)} ${fmt(s.active, 8)} ${fmt(s.eligible, 10)} ${fmt(s.stuck, 8)} ${fmt(s.orphans, 8)} ${s.oldestAgeMin.toFixed(1).padStart(8)}m`
      );
    }
  }

  // 2. Sessions queue
  header('SESSIONS QUEUE — createSessionEnd jobs');
  const queue = await inspectQueue();
  console.log(`  waiting:   ${queue.waiting}`);
  console.log(`  delayed:   ${queue.delayed}`);
  console.log(`  active:    ${queue.active}`);
  console.log(`  failed:    ${queue.failed}`);
  console.log(`  completed: ${queue.completed} (removed-on-complete)`);
  if (queue.failedSample.length > 0) {
    console.log('');
    console.log('  Latest failed jobs:');
    for (const job of queue.failedSample) {
      const when = new Date(job.timestamp).toISOString();
      const reason = (job.failedReason ?? '').slice(0, 200);
      console.log(`    - [${when}] ${job.id}`);
      console.log(`      ${reason}`);
    }
  }

  // 3. Buffers
  header('BUFFERS — pending writes to ClickHouse');
  const buffers = await inspectBuffers();
  console.log(
    `  event buffer:   counter=${buffers.event.counter}  list=${buffers.event.listLen}`
  );
  console.log(
    `  session buffer: counter=${buffers.session.counter}  list=${buffers.session.listLen}`
  );

  // 4. Dedup claims
  header('IDEMPOTENCY — session:end:emitted:* claim keys');
  const claimCount = await inspectSessionEndClaims();
  console.log(
    `  ${claimCount} active claim keys (TTL 2h; bounds at ~last 2h of closes)`
  );

  // 5. ClickHouse reconciliation
  header(`CLICKHOUSE — session_start vs session_end (last ${hours}h)`);
  const chCounts = await inspectClickhouse(
    projectFilter ? [projectFilter] : null,
    hours
  );

  let totalStarts1h = 0;
  let totalEnds1h = 0;
  let totalStartsN = 0;
  let totalEndsN = 0;

  console.log('');
  console.log(
    `  ${'project'.padEnd(40)} ${'start 1h'.padStart(9)} ${'end 1h'.padStart(8)} ${'start ' + hours + 'h'}`.padEnd(58) +
      `${('end ' + hours + 'h').padStart(8)} ${'open'.padStart(8)}`
  );
  for (const [project, c] of [...chCounts.entries()].sort()) {
    const open = c.starts24h - c.ends24h;
    console.log(
      `  ${project.padEnd(40)} ${fmt(c.starts1h, 9)} ${fmt(c.ends1h, 8)} ${fmt(c.starts24h, 10)} ${fmt(c.ends24h, 8)} ${fmt(open, 8)}`
    );
    totalStarts1h += c.starts1h;
    totalEnds1h += c.ends1h;
    totalStartsN += c.starts24h;
    totalEndsN += c.ends24h;
  }
  const openInCh = totalStartsN - totalEndsN;
  console.log('');
  console.log(
    `  ${'TOTAL'.padEnd(40)} ${fmt(totalStarts1h, 9)} ${fmt(totalEnds1h, 8)} ${fmt(totalStartsN, 10)} ${fmt(totalEndsN, 8)} ${fmt(openInCh, 8)}`
  );

  // 6. Reconciliation
  header('RECONCILIATION — Redis active vs CH open');
  const diff = redisInfo.total - openInCh;
  const diffPct =
    openInCh > 0 ? ((Math.abs(diff) / openInCh) * 100).toFixed(1) : '∞';
  console.log(`  Redis active sessions:                ${redisInfo.total}`);
  console.log(`  CH starts - ends in ${hours}h window:        ${openInCh}`);
  console.log(`  Diff:                                 ${diff} (${diffPct}%)`);
  console.log(
    `  Note: diff > 0 means some "open" sessions in Redis were started before the ${hours}h window.`
  );

  // 7. Sample the oldest session in Redis if anything looks suspicious
  if (verbose && redisInfo.stats.some((s) => s.oldestAgeMin > 60 * 6)) {
    header('SAMPLE — oldest session per project (any > 6h)');
    for (const s of redisInfo.stats.filter((x) => x.oldestAgeMin > 60 * 6)) {
      const wallclockKey = `session:wallclock:${s.project}`;
      const [oldest] = await redis.zrange(wallclockKey, 0, 0);
      if (oldest) {
        const blob = await sampleOldestSession(s.project, oldest);
        if (blob) {
          console.log(`  ${s.project} / ${oldest}`);
          console.log(`    id:          ${blob.id}`);
          console.log(`    created_at:  ${blob.created_at}`);
          console.log(`    ended_at:    ${blob.ended_at}`);
          console.log(`    event_count: ${blob.event_count}`);
        }
      }
    }
  }

  // 8. Summary
  header('SUMMARY');
  const issues: string[] = [];
  if (redisInfo.totalStuck > 0) {
    issues.push(
      `${redisInfo.totalStuck} sessions past the stuck cutoff — reaper may be unhealthy`
    );
  }
  if (redisInfo.totalOrphans > 0) {
    issues.push(
      `${redisInfo.totalOrphans} orphan wallclock entries — cleanup() raced or vacuum is overdue`
    );
  }
  if (queue.failed > 0) {
    issues.push(`${queue.failed} failed session_end jobs`);
  }
  if (queue.waiting + queue.active > 5000) {
    issues.push(
      `session_end backlog (waiting=${queue.waiting} active=${queue.active})`
    );
  }
  if (buffers.event.listLen > 50_000) {
    issues.push(`event buffer is backed up (${buffers.event.listLen} items)`);
  }
  if (buffers.session.listLen > 50_000) {
    issues.push(
      `session buffer is backed up (${buffers.session.listLen} items)`
    );
  }
  // The Redis-vs-CH diff is INFORMATIONAL, not an issue on its own:
  //   diff > 0: more in Redis than CH's window — older sessions still active
  //   diff < 0: more starts in CH than Redis active — legacy starts without ends
  //             (e.g. from before a bug fix) that will never close
  // Only flag if both reaper is behind AND the diff is growing — which we can't
  // know from a single run. So just print it; the reaper-behind and stuck
  // counters above will catch live issues.

  if (issues.length === 0) {
    console.log('  [OK]  No issues detected.');
  } else {
    console.log('  [WARN] Issues:');
    for (const i of issues) console.log(`         - ${i}`);
  }

  await redis.quit();
  await ch.close?.();
  process.exit(issues.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
