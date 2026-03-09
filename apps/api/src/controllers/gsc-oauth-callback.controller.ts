import { googleGsc } from '@openpanel/auth';
import { db, encrypt } from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LogError } from '@/utils/errors';

const OAUTH_SENSITIVE_KEYS = ['code', 'state'];

function sanitizeOAuthQuery(
  query: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!query || typeof query !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(query).map(([k, v]) => [
      k,
      OAUTH_SENSITIVE_KEYS.includes(k) ? '<redacted>' : String(v),
    ])
  );
}

export async function gscGoogleCallback(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const schema = z.object({
      code: z.string(),
      state: z.string(),
    });

    const query = schema.safeParse(req.query);
    if (!query.success) {
      throw new LogError(
        'Invalid GSC callback query params',
        sanitizeOAuthQuery(req.query as Record<string, unknown>)
      );
    }

    const { code, state } = query.data;
    const storedState = req.cookies.gsc_oauth_state ?? null;
    const codeVerifier = req.cookies.gsc_code_verifier ?? null;
    const projectId = req.cookies.gsc_project_id ?? null;

    const hasStoredState = storedState !== null;
    const hasCodeVerifier = codeVerifier !== null;
    const hasProjectId = projectId !== null;
    const hasAllCookies = hasStoredState && hasCodeVerifier && hasProjectId;
    if (!hasAllCookies) {
      throw new LogError('Missing GSC OAuth cookies', {
        storedState: !hasStoredState,
        codeVerifier: !hasCodeVerifier,
        projectId: !hasProjectId,
      });
    }

    if (state !== storedState) {
      throw new LogError('GSC OAuth state mismatch', {
        hasState: true,
        hasStoredState: true,
        stateMismatch: true,
      });
    }

    const tokens = await googleGsc.validateAuthorizationCode(
      code,
      codeVerifier
    );

    const accessToken = tokens.accessToken();
    const refreshToken = tokens.hasRefreshToken()
      ? tokens.refreshToken()
      : null;
    const accessTokenExpiresAt = tokens.accessTokenExpiresAt();

    if (!refreshToken) {
      throw new LogError('No refresh token returned from Google GSC OAuth');
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true },
    });

    if (!project) {
      throw new LogError('Project not found for GSC connection', { projectId });
    }

    await db.gscConnection.upsert({
      where: { projectId },
      create: {
        projectId,
        accessToken: encrypt(accessToken),
        refreshToken: encrypt(refreshToken),
        accessTokenExpiresAt,
        siteUrl: '',
      },
      update: {
        accessToken: encrypt(accessToken),
        refreshToken: encrypt(refreshToken),
        accessTokenExpiresAt,
        lastSyncStatus: null,
        lastSyncError: null,
      },
    });

    reply.clearCookie('gsc_oauth_state');
    reply.clearCookie('gsc_code_verifier');
    reply.clearCookie('gsc_project_id');

    const dashboardUrl =
      process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!;
    const redirectUrl = `${dashboardUrl}/${project.organizationId}/${projectId}/settings/gsc`;
    return reply.redirect(redirectUrl);
  } catch (error) {
    req.log.error(error);
    reply.clearCookie('gsc_oauth_state');
    reply.clearCookie('gsc_code_verifier');
    reply.clearCookie('gsc_project_id');
    return redirectWithError(reply, error);
  }
}

function redirectWithError(reply: FastifyReply, error: LogError | unknown) {
  const url = new URL(
    process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!
  );
  url.pathname = '/login';
  if (error instanceof LogError) {
    url.searchParams.set('error', error.message);
  } else {
    url.searchParams.set('error', 'Failed to connect Google Search Console');
  }
  url.searchParams.set('correlationId', reply.request.id);
  return reply.redirect(url.toString());
}
