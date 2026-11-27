import type { ValidateIngestRequest } from '../../../http/client-auth';
import { headerValue, type IngestHeaders } from '../../../shared/headers';
import { validateIngestRequest } from '../../ingest/src/client-auth';

const AUTHORIZATION_SCHEME = /^(?:bearer|basic)\s+(\S+)$/i;

/** `Bearer|Basic base64(clientId:clientSecret)`, the one header RevenueCat can send. */
export function credentialsFromAuthorization(
  headers: IngestHeaders
): { clientId: string; clientSecret: string } | null {
  const match = AUTHORIZATION_SCHEME.exec(
    headerValue(headers, 'authorization') ?? ''
  );
  if (!match?.[1]) {
    return null;
  }
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
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
  const credentials = credentialsFromAuthorization(headers);
  if (!credentials) {
    return {
      ok: false,
      message:
        'RevenueCat: Authorization must be Bearer base64(clientId:clientSecret)',
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
