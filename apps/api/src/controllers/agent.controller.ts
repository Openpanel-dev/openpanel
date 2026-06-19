import {
  TABLE_NAMES,
  type IClickhouseSession,
  chQuery,
  getSessionList,
  transformSession,
} from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import sqlstring from 'sqlstring';

/**
 * Hardcoded for now — frameo is the only project with an LLM agent. Add a
 * :projectId param when a second project's agent needs this.
 */
const PROJECT_ID = 'frameo';
const DASHBOARD_BASE = 'https://openpanel.dashverse.ai/dashverse/frameo/sessions';

const DEFAULT_SESSION_LIMIT = 20;
const MAX_SESSION_LIMIT = 100;

/**
 * GET /agent/users/:fbUid/sessions?limit=20&with_replay=true
 *
 * Returns the user's recent sessions with a dashboard URL per row. Defaults
 * to only sessions that have a replay attached (the agent's whole reason for
 * calling this — to hand a playable URL back to a human). Set
 * `with_replay=false` to include sessions without recording.
 */
export async function listUserSessions(
  req: FastifyRequest<{
    Params: { fbUid: string };
    Querystring: { limit?: string; with_replay?: string };
  }>,
  reply: FastifyReply,
) {
  const { fbUid } = req.params;
  const limit = clampLimit(
    req.query.limit,
    DEFAULT_SESSION_LIMIT,
    MAX_SESSION_LIMIT,
  );
  const withReplay = req.query.with_replay !== 'false';

  let items: ReturnType<typeof transformSession>[];

  if (withReplay) {
    // Direct SQL: join sessions ↔ session_replay_chunks server-side so we
    // never page through replay-less rows just to drop them on the agent's
    // side.
    const sql = `
      SELECT *
      FROM ${TABLE_NAMES.sessions} FINAL
      WHERE project_id = ${sqlstring.escape(PROJECT_ID)}
        AND profile_id = ${sqlstring.escape(fbUid)}
        AND id IN (
          SELECT DISTINCT session_id
          FROM ${TABLE_NAMES.session_replay_chunks}
          WHERE project_id = ${sqlstring.escape(PROJECT_ID)}
        )
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    const rows = await chQuery<IClickhouseSession>(sql);
    items = rows.map((r) => ({ ...transformSession(r), hasReplay: true }));
  } else {
    const result = await getSessionList({
      projectId: PROJECT_ID,
      profileId: fbUid,
      take: limit,
    });
    items = result.items;
  }

  return reply.send({
    profile_id: fbUid,
    with_replay: withReplay,
    count: items.length,
    sessions: items.map((s) => ({
      session_id: s.id,
      started_at: s.createdAt,
      ended_at: s.endedAt,
      duration_sec: s.duration,
      event_count: s.eventCount,
      entry_path: s.entryPath,
      exit_path: s.exitPath,
      country: s.country,
      city: s.city,
      os: s.os,
      browser: s.browser,
      device: s.device,
      has_replay: s.hasReplay ?? false,
      dashboard_url: `${DASHBOARD_BASE}/${s.id}`,
    })),
  });
}

function clampLimit(raw: string | undefined, fallback: number, max: number) {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}
