import type { ValidateIngestRequest } from '../../../http/client-auth';
import { headerValue, type IngestHeaders } from '../../../shared/headers';
import { validateIngestRequest } from '../../ingest/src/client-auth';
import {
  findRevenueCatWebhookByToken,
  REVENUECAT_TOKEN_PREFIX,
} from '../revenuecat.service';

const AUTHORIZATION_SCHEME = /^(?:bearer|basic)\s+(\S+)$/i;

function authorizationValue(headers: IngestHeaders): string | null {
  return (
    AUTHORIZATION_SCHEME.exec(
      headerValue(headers, 'authorization') ?? ''
    )?.[1] ?? null
  );
}

/** The token the project's RevenueCat tab hands out: `Bearer rcwh_…`. */
export function webhookTokenFromAuthorization(
  headers: IngestHeaders
): string | null {
  const value = authorizationValue(headers);
  return value?.startsWith(REVENUECAT_TOKEN_PREFIX) ? value : null;
}

/** `Bearer|Basic base64(clientId:clientSecret)` of a project client, also accepted. */
export function credentialsFromAuthorization(
  headers: IngestHeaders
): { clientId: string; clientSecret: string } | null {
  const value = authorizationValue(headers);
  if (!value) {
    return null;
  }
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator <= 0 || separator === decoded.length - 1) {
    return null;
  }
  return {
    clientId: decoded.slice(0, separator),
    clientSecret: decoded.slice(separator + 1),
  };
}

/**
 * The ingest check with the credentials taken from `Authorization`. A webhook
 * comes from a server, so the secret must match: a client id alone, which a
 * web page may carry, is refused.
 */
export const validateRevenueCatRequest: ValidateIngestRequest = async ({
  deps,
  headers,
  clientIp,
}) => {
  const token = webhookTokenFromAuthorization(headers);
  if (token) {
    const webhook = await findRevenueCatWebhookByToken(deps, token);
    if (!webhook) {
      return {
        ok: false,
        message: 'RevenueCat: Unknown webhook token',
        secretVerified: false,
      };
    }
    return {
      ok: true,
      client: {
        id: webhook.id,
        projectId: webhook.projectId,
        organizationId: webhook.organizationId,
        type: 'write',
      },
      secretVerified: true,
    };
  }

  const credentials = credentialsFromAuthorization(headers);
  if (!credentials) {
    return {
      ok: false,
      message:
        'RevenueCat: Authorization must be the header from the RevenueCat tab of the project',
      payload: {},
      secretVerified: false,
    };
  }
  const outcome = await validateIngestRequest({
    deps,
    headers: {
      'openpanel-client-id': credentials.clientId,
      'openpanel-client-secret': credentials.clientSecret,
    },
    clientIp,
    body: undefined,
  });
  if (outcome.ok && !outcome.secretVerified) {
    return {
      ok: false,
      message: 'RevenueCat: Invalid client secret',
      payload: { clientId: credentials.clientId },
      secretVerified: false,
    };
  }
  return outcome;
};
