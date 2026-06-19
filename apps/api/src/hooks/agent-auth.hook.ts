import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Bearer-token auth for the /agent endpoints. The allow-list comes from
 * AGENT_API_KEYS (comma-separated). Each consumer (frameo-cat, other internal
 * agents) gets its own key so we can revoke individually.
 */
export async function agentAuthHook(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const allowList = (process.env.AGENT_API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (allowList.length === 0) {
    req.log.error('AGENT_API_KEYS is not configured');
    return reply.status(503).send({ error: 'agent api not configured' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token || !allowList.includes(token)) {
    return reply.status(401).send({ error: 'invalid or missing bearer token' });
  }
}
