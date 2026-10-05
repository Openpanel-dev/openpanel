// Local-only: `main.ts` mounts this only outside production AND only in a
// consuming role, which keeps an unauthenticated "run any cron job now"
// endpoint off a production box.
//
// The job list is the `cron` queue's own `jobs`, so it cannot drift from the
// registry; the queue arrives as an argument because transport may not import
// a registry. A trigger runs through `runJob`, the real worker's entry point.

import { z } from 'zod';
import type { AnyJob, QueueDefinition } from '../jobs/define';
import { runJob } from '../jobs/workers';
import { defineRoutes } from './define';

export type CronQueue = QueueDefinition<Record<string, AnyJob>>;

const BAD_REQUEST = 400;
const INTERNAL_ERROR = 500;
const DIGEST_INSIGHT_LIMIT = 15;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
const HTML_ESCAPABLE = /[&<>"]/g;

function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPABLE, (char) => HTML_ESCAPES[char] ?? char);
}

// Browsers send an explicit `text/html` accept header; curl sends the
// wildcard, which falls through to JSON.
function wantsHtml(headers: Headers): boolean {
  return (headers.get('accept') ?? '').includes('text/html');
}

function buildJobs(request: Request, cronTypes: string[]) {
  const base = new URL(request.url).origin;
  return cronTypes.map((type) => ({
    type,
    url: `${base}/debug/cron/${type}`,
  }));
}

function renderHtml(
  jobs: { type: string; url: string }[],
  message?: string
): string {
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

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const projectIdParams = z.object({ projectId: z.string() });
const HIDDEN = { hide: true } as const;

export const createDebugRoutes = (cronQueue: CronQueue) => {
  const cronTypes = Object.keys(cronQueue.jobs);

  return defineRoutes((app, deps) =>
    app
      .get(
        '/debug/cron',
        ({ request, set }) => {
          const jobs = buildJobs(request, cronTypes);
          if (wantsHtml(request.headers)) {
            set.headers['content-type'] = 'text/html; charset=utf-8';
            return renderHtml(jobs);
          }
          return {
            message: 'Run a cron job now with GET or POST /debug/cron/:type',
            jobs,
          };
        },
        { detail: HIDDEN }
      )
      .all(
        '/debug/cron/:type',
        async ({ params, request, set, ctx }) => {
          const { type } = params as { type: string };
          const jobs = buildJobs(request, cronTypes);
          const html = wantsHtml(request.headers);

          if (!cronTypes.includes(type)) {
            set.status = BAD_REQUEST;
            const message = `Unknown cron type "${type}"`;
            if (html) {
              set.headers['content-type'] = 'text/html; charset=utf-8';
              return renderHtml(jobs, message);
            }
            return { ok: false, error: message, jobs };
          }

          ctx.logger.info({ type }, 'Manually triggering cron job');

          try {
            await runJob(
              cronQueue,
              { name: type, data: { type }, attemptsMade: 0 },
              deps
            );
          } catch (error) {
            ctx.logger.error(
              { err: error, type },
              'Manual cron trigger failed'
            );
            set.status = INTERNAL_ERROR;
            if (html) {
              set.headers['content-type'] = 'text/html; charset=utf-8';
              return renderHtml(
                jobs,
                `Error running ${type}: ${errorMessage(error)}`
              );
            }
            return { ok: false, type, error: errorMessage(error) };
          }

          if (html) {
            set.headers['content-type'] = 'text/html; charset=utf-8';
            return renderHtml(jobs, `${type} ran. Check the logs for details.`);
          }
          return { ok: true, type };
        },
        { detail: HIDDEN }
      )
      // One project's insights pipeline, bypassing the daily cron's eligibility
      // filter. Default enqueues a real job; `?inline=1` runs it here.
      .get(
        '/debug/insights/:projectId',
        async ({ params, query, set, ctx }) => {
          const { projectId } = params;
          const inline = query.inline === '1' || query.inline === 'true';
          const date = new Date().toISOString().slice(0, 10);

          try {
            if (inline) {
              ctx.logger.info({ projectId }, 'Manual insights run (inline)');
              await ctx.services.insight.runProjectInsights({
                projectId,
                date,
              });
              return {
                ok: true,
                projectId,
                date,
                insights: await ctx.services.insight.listAllInsights({
                  projectId,
                  limit: DIGEST_INSIGHT_LIMIT,
                }),
              };
            }

            const jobId = await ctx.queues.insights.insightsProject.add(
              { projectId, date },
              // Unique id so repeated runs are not deduped by BullMQ.
              { jobId: `debug:${projectId}:${Date.now()}` }
            );
            ctx.logger.info({ projectId, jobId }, 'Enqueued insights job');
            return {
              ok: true,
              projectId,
              jobId,
              message:
                'Enqueued on the "insights" queue — watch it in bull-board. Add ?inline=1 to run synchronously.',
            };
          } catch (error) {
            ctx.logger.error(
              { err: error, projectId },
              'Manual insights failed'
            );
            set.status = INTERNAL_ERROR;
            return { ok: false, projectId, error: errorMessage(error) };
          }
        },
        { params: projectIdParams, detail: HIDDEN }
      )
      // Weekly digest for one project, bypassing eligibility.
      //   ?to=you@example.com  → send only to that address
      //   (no ?to)             → return the assembled payload without sending
      //   ?force=1             → build even with 0 visitors this week
      .get(
        '/debug/weekly-digest/:projectId',
        async ({ params, query, set, ctx }) => {
          const { projectId } = params;
          const to = typeof query.to === 'string' ? query.to : undefined;
          const force = query.force === '1' || query.force === 'true';
          ctx.logger.info({ projectId, to, force }, 'Manual weekly digest');

          try {
            return {
              ok: true,
              ...(await ctx.services.insight.previewWeeklyDigest(projectId, {
                to,
                force,
              })),
            };
          } catch (error) {
            ctx.logger.error({ err: error, projectId }, 'Manual digest failed');
            set.status = INTERNAL_ERROR;
            return { ok: false, projectId, error: errorMessage(error) };
          }
        },
        { params: projectIdParams, detail: HIDDEN }
      )
  );
};
