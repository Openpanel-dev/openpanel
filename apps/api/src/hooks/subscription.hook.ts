import { getOrganizationByProjectIdCached } from '@openpanel/db';
import type {
  DeprecatedPostEventPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Rejects ingestion for organizations that have been blocked by the wind-down
 * sequence (see apps/worker/src/jobs/cron.wind-down.ts).
 *
 * Two things worth knowing about the shape of this:
 *
 * It gates on `windDownStep`, not on `subscriptionState`. Every expired trial
 * is already in `trial_expired`, so gating on the state would block thousands
 * of orgs the moment this ships, skipping the four warning emails entirely.
 * The step only reaches 'blocked' after the org has been told three times.
 *
 * It answers 202, not 402 or 403. The SDKs treat only 401 and 2xx as terminal
 * (packages/sdks/sdk/src/api.ts); every other status is thrown and retried
 * three times with backoff, so a "correct" status code would multiply traffic
 * from exactly the clients we are trying to quiet down. This matches how
 * isBotHook already drops traffic.
 */

const BLOCKED_STEPS = new Set(['blocked', 'final_warning']);

export async function subscriptionHook(
  req: FastifyRequest<{
    Body: ITrackHandlerPayload | DeprecatedPostEventPayload;
  }>,
  reply: FastifyReply,
) {
  if (process.env.SELF_HOSTED === 'true') {
    return;
  }

  const projectId = req.client?.projectId;
  if (!projectId) {
    return;
  }

  try {
    // Cached for 5 minutes and invalidated by the Polar webhook, so paying
    // again lifts the block on the next checkout rather than on a TTL.
    const organization = await getOrganizationByProjectIdCached(projectId);

    if (!organization?.windDownStep) {
      return;
    }

    if (!BLOCKED_STEPS.has(organization.windDownStep)) {
      return;
    }

    req.log.info(
      {
        organizationId: organization.id,
        projectId,
        windDownStep: organization.windDownStep,
      },
      'Ingestion blocked by wind-down',
    );

    return reply.status(202).send({ blocked: true });
  } catch (error) {
    // Fail open. Dropping a paying customer's events because Redis or Postgres
    // hiccuped is far worse than letting a blocked org through for a tick.
    req.log.error(
      { err: error, projectId },
      'Wind-down check failed, allowing ingestion',
    );
  }
}
