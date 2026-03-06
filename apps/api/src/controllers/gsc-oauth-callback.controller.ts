import { COOKIE_OPTIONS, googleGsc } from '@openpanel/auth';
import { db } from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LogError } from '@/utils/errors';

export async function gscInitiate(req: FastifyRequest, reply: FastifyReply) {
  const schema = z.object({
    state: z.string(),
    code_verifier: z.string(),
    project_id: z.string(),
    redirect: z.string().url(),
  });

  const query = schema.safeParse(req.query);
  if (!query.success) {
    return reply.status(400).send({ error: 'Invalid parameters' });
  }

  const { state, code_verifier, project_id, redirect } = query.data;

  reply.setCookie('gsc_oauth_state', state, { maxAge: 60 * 10, ...COOKIE_OPTIONS });
  reply.setCookie('gsc_code_verifier', code_verifier, { maxAge: 60 * 10, ...COOKIE_OPTIONS });
  reply.setCookie('gsc_project_id', project_id, { maxAge: 60 * 10, ...COOKIE_OPTIONS });

  return reply.redirect(redirect);
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
      throw new LogError('Invalid GSC callback query params', {
        error: query.error,
        query: req.query,
      });
    }

    const { code, state } = query.data;
    const storedState = req.cookies.gsc_oauth_state ?? null;
    const codeVerifier = req.cookies.gsc_code_verifier ?? null;
    const projectId = req.cookies.gsc_project_id ?? null;

    if (!storedState || !codeVerifier || !projectId) {
      throw new LogError('Missing GSC OAuth cookies', {
        storedState: storedState === null,
        codeVerifier: codeVerifier === null,
        projectId: projectId === null,
      });
    }

    if (state !== storedState) {
      throw new LogError('GSC OAuth state mismatch', { state, storedState });
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
        accessToken,
        refreshToken,
        accessTokenExpiresAt,
        siteUrl: '',
      },
      update: {
        accessToken,
        refreshToken,
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
