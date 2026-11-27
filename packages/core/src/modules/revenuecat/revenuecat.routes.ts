// RevenueCat webhooks straight into a project: the subscription events an app
// cannot see itself (renewals, expirations, billing issues) while it is closed.
// RevenueCat retries anything but a 200, so a type OpenPanel does not record
// still answers 200.

import { defineRoutes } from '../../http/define';
import { ingestTrack } from '../ingest/ingest.service';
import { produceIncomingEvent } from '../ingest/src/kafka';
import {
  REVENUECAT_DEDUPE_SECONDS,
  zRevenueCatWebhook,
} from './revenuecat.constants';
import { recordRevenueCatDelivery } from './revenuecat.service';
import { validateRevenueCatRequest } from './src/auth';
import { mapRevenueCatEvent } from './src/map';

const TAGS = ['Integrations'];
// A `name/version` agent marks a server event: it joins the user's session
// instead of opening one for RevenueCat's own machine.
const SERVER_HEADERS = { 'user-agent': 'RevenueCat/1.0' };

export const revenueCatRoutes = defineRoutes((app) =>
  app.post(
    '/integrations/revenuecat',
    async ({ body, client, ctx, status, timestamp }) => {
      if (client.projectId) {
        await recordRevenueCatDelivery(ctx, client.projectId, body.event.type);
      }
      const tracks = mapRevenueCatEvent(body.event);
      if (tracks.length === 0) {
        return { tracked: 0 };
      }

      const dedupeKey = `revenuecat:event:${client.projectId}:${body.event.id}`;
      const first = await ctx.redis.set(
        dedupeKey,
        '1',
        'EX',
        REVENUECAT_DEDUPE_SECONDS,
        'NX'
      );
      if (first !== 'OK') {
        return { tracked: 0, duplicate: true };
      }

      try {
        for (const track of tracks) {
          const outcome = await ingestTrack(
            {
              projectId: client.projectId,
              // The location would be RevenueCat's; `country_code` carries the user's.
              clientIp: '',
              headers: SERVER_HEADERS,
              clientSecretAuth: true,
              timestamp,
              body: { type: 'track', payload: track },
            },
            {
              buffers: ctx.buffers,
              produceIncomingEvent: (payload, partitionKey) =>
                produceIncomingEvent(ctx.config, payload, partitionKey),
              deps: ctx,
            }
          );
          if (outcome.status !== 'ok') {
            throw new Error(`RevenueCat event not ingested: ${outcome.status}`);
          }
        }
      } catch (error) {
        await ctx.redis.del(dedupeKey);
        throw error;
      }
      return status(200, { tracked: tracks.length });
    },
    {
      clientAuth: { ingest: validateRevenueCatRequest },
      body: zRevenueCatWebhook,
      detail: {
        tags: TAGS,
        description:
          'Receive a RevenueCat webhook. Authorization: the header from the RevenueCat tab of the project, or Bearer base64(clientId:clientSecret) of a project client.',
      },
    }
  )
);
