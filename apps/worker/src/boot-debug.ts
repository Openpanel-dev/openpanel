import { db } from '@openpanel/db';
import {
  type CronQueuePayload,
  type CronQueueType,
  type InsightsQueuePayloadProject,
  insightsQueue,
} from '@openpanel/queue';
import type { Job } from 'bullmq';
import type { Express, Request } from 'express';
import { cronJob } from './jobs/cron';
import { insightsProjectJob } from './jobs/insights';
import { previewWeeklyDigestForProject } from './jobs/cron.weekly-digest';
import { logger } from './utils/logger';

const CRON_TYPES = [
  'salt',
  'flushEvents',
  'flushProfiles',
  'flushSessions',
  'flushProfileBackfill',
  'flushReplay',
  'flushGroups',
  'ping',
  'delete',
  'insightsDaily',
  'onboarding',
  'gscSync',
  'cohortRefresh',
  'sessionReaper',
  'sessionVacuum',
  'insightCleanup',
  'weeklyDigest',
  'flushExports',
] as const satisfies readonly CronQueueType[];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildJobs(req: Request) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return CRON_TYPES.map((type) => ({
    type,
    url: `${baseUrl}/debug/cron/${type}`,
  }));
}

// Browsers send an explicit `text/html` accept, curl sends `*/*`. Listing json
// first means the wildcard falls back to json while a browser still gets html.
function wantsHtml(req: Request) {
  return req.accepts(['json', 'html']) === 'html';
}

function renderHtml(jobs: { type: string; url: string }[], message?: string) {
  const links = jobs
    .map((job) => `<li><a href="${job.url}">${escapeHtml(job.type)}</a></li>`)
    .join('');
  const note = message
    ? `<pre>${escapeHtml(message)}</pre>`
    : '<p>Click a job to run it now.</p>';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Debug cron</title></head>
<body style="font-family: ui-monospace, monospace; max-width: 40rem; margin: 2rem auto;">
<h1>Trigger a cron job</h1>
${note}
<ul>${links}</ul>
</body>
</html>`;
}

// Local-only debug routes to run a cron job on demand instead of waiting for
// its schedule. Runs the job in this process through the same dispatcher the
// scheduler uses, so it reuses the worker's db, redis and clickhouse clients.
// Returns clickable links: an HTML page in a browser, full URLs in JSON for
// curl. Only mounted when NODE_ENV !== 'production'.
export function bootDebugRoutes(app: Express) {
  app.get('/debug/cron', (req, res) => {
    const jobs = buildJobs(req);
    if (wantsHtml(req)) {
      res.type('html').send(renderHtml(jobs));
      return;
    }
    res.json({
      message: 'Run a cron job now with GET or POST /debug/cron/:type',
      jobs,
    });
  });

  app.all('/debug/cron/:type', async (req, res) => {
    const type = req.params.type;
    const jobs = buildJobs(req);
    const html = wantsHtml(req);

    if (!CRON_TYPES.includes(type as CronQueueType)) {
      const message = `Unknown cron type "${type}"`;
      if (html) {
        res.status(400).type('html').send(renderHtml(jobs, message));
        return;
      }
      res.status(400).json({ ok: false, error: message, jobs });
      return;
    }

    logger.info({ type }, 'Manually triggering cron job');

    try {
      const result = await cronJob({
        data: { type: type as CronQueueType, payload: undefined },
      } as Job<CronQueuePayload>);
      if (html) {
        res
          .type('html')
          .send(
            renderHtml(
              jobs,
              `${type} ran. Result: ${JSON.stringify(result ?? null)}. Check the worker logs for details.`,
            ),
          );
        return;
      }
      res.json({ ok: true, type, result: result ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, type }, 'Manual cron trigger failed');
      if (html) {
        res
          .status(500)
          .type('html')
          .send(renderHtml(jobs, `Error running ${type}: ${message}`));
        return;
      }
      res.status(500).json({ ok: false, type, error: message });
    }
  });

  // Run the full insights pipeline (engine + AI enrichment) for ONE project,
  // bypassing the eligibility filter the daily cron applies. For local testing.
  //
  // Default: enqueues a real `insightsProject` job on the `insights` queue, so
  // it shows up in BullBoard and runs through the normal worker path.
  // `?inline=1`: runs synchronously instead and returns a result summary.
  app.get('/debug/insights/:projectId', async (req, res) => {
    const projectId = req.params.projectId;
    const inline = req.query.inline === '1' || req.query.inline === 'true';
    const date = new Date().toISOString().slice(0, 10);

    if (!inline) {
      try {
        const job = await insightsQueue.add(
          'insightsProject',
          { type: 'insightsProject', payload: { projectId, date } },
          // Unique id so repeated test runs aren't deduped by BullMQ.
          { jobId: `debug:${projectId}:${Date.now()}` },
        );
        logger.info({ projectId, jobId: job.id }, 'Enqueued insights job');
        res.json({
          ok: true,
          projectId,
          jobId: job.id,
          message:
            'Enqueued on the "insights" queue — watch it in BullBoard. Add ?inline=1 to run synchronously and get a result summary.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, projectId }, 'Failed to enqueue insights');
        res.status(500).json({ ok: false, projectId, error: message });
      }
      return;
    }

    logger.info({ projectId }, 'Manually running insights for project (inline)');

    try {
      await insightsProjectJob({
        data: { type: 'insightsProject', payload: { projectId, date } },
      } as Job<InsightsQueuePayloadProject>);

      const countsByState = await db.projectInsight.groupBy({
        by: ['state'],
        where: { projectId },
        _count: true,
      });

      const topActive = await db.projectInsight.findMany({
        where: { projectId, state: 'active' },
        orderBy: [
          { relevanceScore: { sort: 'desc', nulls: 'last' } },
          { impactScore: 'desc' },
        ],
        take: 15,
        select: {
          title: true,
          aiSummary: true,
          aiCategory: true,
          relevanceScore: true,
          emailWorthy: true,
          referenceWorthy: true,
          enrichedAt: true,
        },
      });

      const enrichedCount = topActive.filter((i) => i.enrichedAt).length;

      res.json({
        ok: true,
        projectId,
        countsByState,
        enrichedInTopActive: `${enrichedCount}/${topActive.length}`,
        topActive,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, projectId }, 'Manual insights run failed');
      res.status(500).json({ ok: false, projectId, error: message });
    }
  });

  // Weekly digest for ONE project, bypassing eligibility. For local testing.
  //   ?to=you@example.com  → send only to that address
  //   (no ?to)             → return the assembled payload without sending
  //   ?force=1             → build even with 0 visitors this week
  app.get('/debug/weekly-digest/:projectId', async (req, res) => {
    const projectId = req.params.projectId;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const force = req.query.force === '1' || req.query.force === 'true';
    logger.info({ projectId, to, force }, 'Manual weekly digest');

    try {
      const result = await previewWeeklyDigestForProject(projectId, {
        to,
        force,
      });
      res.json({
        ok: true,
        ...result,
        hint: to
          ? `Sent to ${to} (needs RESEND_API_KEY/SMTP_HOST, else logged to worker console).`
          : 'Preview only — add ?to=you@example.com to send. ?force=1 builds even with no traffic this week.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, projectId }, 'Manual weekly digest failed');
      res.status(500).json({ ok: false, projectId, error: message });
    }
  });

  logger.info('Debug cron endpoint enabled: /debug/cron/:type');
  logger.info('Debug insights endpoint enabled: /debug/insights/:projectId');
  logger.info(
    'Debug weekly digest enabled: /debug/weekly-digest/:projectId?to=&force=1',
  );
}

