// Mounted on the main port behind the dashboard session guard. Two things a
// reader must not mistake for accidents:
//
// 1. The base path is `/bullboard`, not `/`: one port serves everything, so
//    `/` would shadow every other route.
// 2. Pausing `cron` from this UI halts ALL buffer flushing.

import type { Queue as BullQueue } from 'bullmq';
import { Elysia } from 'elysia';
import type { AppDeps } from '../context';
import { basicAuthChallenge, matchesBasicAuth } from '../shared/basic-auth';
import { requestContext } from './context';

export const BULL_BOARD_BASE_PATH = '/bullboard';

const UNAUTHORIZED = 401;
const BULL_BOARD_REALM = 'OpenPanel ops';

/**
 * The guard is `{ as: 'global' }` and re-checks the path itself rather than
 * leaning on Elysia's hook scoping: `.use()`-ing a NAMED plugin
 * (`@bull-board/elysia`) puts its routes in their own scope, where a `local`
 * hook of the mounting instance would not run at all. The cost on every other
 * route is one `startsWith`.
 */
export async function bullBoardRoutes(
  deps: AppDeps,
  queues: BullQueue[]
): Promise<Elysia> {
  // Imported here, not at module scope: `@bull-board/elysia` is CommonJS and
  // `require()`s Elysia's CJS build, which under Bun 1.4.0 throws "require()
  // async module ... is unsupported" while this package's module graph is
  // still evaluating.
  const [{ createBullBoard }, { BullMQAdapter }, { ElysiaAdapter }] =
    await Promise.all([
      import('@bull-board/api'),
      import('@bull-board/api/bullMQAdapter'),
      import('@bull-board/elysia'),
    ]);

  const serverAdapter = new ElysiaAdapter({
    prefix: BULL_BOARD_BASE_PATH,
    basePath: BULL_BOARD_BASE_PATH,
  });

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  const board = await serverAdapter.registerPlugin();

  return new Elysia({ name: 'core/http/bull-board' })
    .use(requestContext(deps))
    .onBeforeHandle(
      { as: 'global' },
      async ({ path, ctx, status, request, set }) => {
        if (!path.startsWith(BULL_BOARD_BASE_PATH)) {
          return;
        }
        // Two gates, both required: a dashboard session proves a human, the
        // operator credentials prove an operator. The queue UI can add, retry
        // and clean jobs, so any signed-up user is not enough (GHSA-r627-6vrh-65p9).
        if (!(await ctx.session())) {
          return status(UNAUTHORIZED);
        }
        const admin = ctx.config.adminAuth;
        if (
          admin &&
          !matchesBasicAuth(request.headers.get('authorization'), admin)
        ) {
          set.headers = {
            ...set.headers,
            ...basicAuthChallenge(BULL_BOARD_REALM),
          };
          return status(UNAUTHORIZED);
        }
      }
    )
    .use(board) as unknown as Elysia;
}
