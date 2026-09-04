import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dissolved into @openpanel/core's integration + subscription modules
// (M6-006): the Slack token-exchange/upsert logic moved to
// integration.service.ts's `completeSlackOAuthCallback`, and the Polar event
// validation/dispatch logic moved to subscription.service.ts's
// `handlePolarWebhookEvent`. This controller stays the LIVE route (DELEGATE
// PATTERN) — it keeps Fastify's `rawBody` config (signature verification
// breaks on any body parsing) and delegates to those functions, the same
// function core's own `/webhook/slack` and `/webhook/polar` routes call.
import {
  completeSlackOAuthCallback,
  handlePolarWebhookEvent,
} from '@openpanel/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

const paramsSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export async function slackWebhook(
  request: FastifyRequest<{
    Querystring: unknown;
  }>,
  reply: FastifyReply
) {
  const parsedParams = paramsSchema.safeParse(request.query);

  if (!parsedParams.success) {
    request.log.error(parsedParams.error, 'Invalid params');
    return reply.status(400).send({ error: 'Invalid params' });
  }

  try {
    const { organizationId, projectId } = await completeSlackOAuthCallback(
      parsedParams.data
    );

    const dashboardUrl =
      process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL;
    // Integrations are project-scoped; the org-level integrations route no
    // longer exists. Newer installs carry projectId in their metadata. Older
    // in-flight installs (started before the project-scoped routes shipped)
    // may lack it — fall back to the org landing page rather than a now-404
    // integrations URL.
    return reply.redirect(
      projectId
        ? `${dashboardUrl}/${organizationId}/${projectId}/integrations/installed`
        : `${dashboardUrl}/${organizationId}`
    );
  } catch (err) {
    request.log.error(err, 'Slack OAuth callback error');
    const html = fs.readFileSync(path.join(__dirname, 'error.html'), 'utf8');
    return reply.status(500).header('Content-Type', 'text/html').send(html);
  }
}

export async function polarWebhook(
  request: FastifyRequest<{
    Querystring: unknown;
  }>,
  reply: FastifyReply
) {
  await handlePolarWebhookEvent(
    request.rawBody!,
    request.headers as Record<string, string>,
    request.log
  );

  return reply.status(202).send('OK');
}
