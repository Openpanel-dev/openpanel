import type { CronQueuePayload, CronQueueType } from '@openpanel/queue';
import type { Job } from 'bullmq';
import type { Express, Request } from 'express';
import { cronJob } from './jobs/cron';
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

  logger.info('Debug cron endpoint enabled: /debug/cron/:type');
}
