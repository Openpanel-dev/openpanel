// Bull-board, on the main port, behind the dashboard session guard (ADR-005
// recommendation 6). What dies with it is `@bull-board/express` and the
// worker's second express server — nothing named `@bull-board/fastify` ever
// existed. `@bull-board/api` + `@bull-board/elysia` are both pinned exact 9.6.0
// (ADR-017 register row 4 grants the bump+swap at P9).
//
// TWO things a reader must not mistake for accidents:
//
// 1. **The base path moved.** V1 served bull-board at `/` on the worker's own
// express server (apps/worker/src/index.ts, `setBasePath('/')`). V2 has one
// port for everything, so `/` would shadow every other route. It is
// `/bullboard`; that is a deploy-note, written up in
// `packages/core/docs/OPS_GRAFANA_MIGRATION.md`. 2. **Pausing `cron` from this
// UI halts ALL buffer flushing.** Preserved deliberately.

import type { Queue as BullQueue } from 'bullmq';
import { Elysia } from 'elysia';
import type { AppDeps } from '../context';
import { basicAuthChallenge, matchesBasicAuth } from '../shared/basic-auth';
import { requestContext } from './context';

export const BULL_BOARD_BASE_PATH = '/bullboard';

const UNAUTHORIZED = 401;
const BULL_BOARD_REALM = 'OpenPanel ops';

/**
 * Mounted only where the role consumes and `DISABLE_BULLBOARD` is unset
 * (main.ts owns both conditions — core reads no environment).
 *
 * The guard is `{ as: 'global' }` and re-checks the path itself rather than
 * leaning on Elysia's hook scoping: `.use()`-ing a NAMED plugin
 * (`@bull-board/elysia`) puts its routes in their own scope, where a `local`
 * hook of the mounting instance would not run at all — and a guard that
 * silently does not run is precisely the failure this must not have. The cost
 * on every other route is one `startsWith`.
 */
export async function bullBoardRoutes(
  deps: AppDeps,
  queues: BullQueue[]
): Promise<Elysia> {
  // Imported here, not at module scope. `@bull-board/elysia` is CommonJS, so
  // it `require()`s Elysia's CJS build, which `require()`s memoirist — and
  // under Bun 1.4.0 that throws "require() async module ... is unsupported"
  // if it happens while this package's module graph is still evaluating.
  // Deferring it to the one call site that needs it puts the require after
  // evaluation, where it resolves cleanly. Proven by
  // `bun run apps/api/e2e/boot-proof.sh`'s ROLE=worker/all legs, which 401
  // on /bullboard rather than failing to boot.
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
        // and clean jobs, so being any signed-up user is not enough
        // (main #511, GHSA-r627-6vrh-65p9).
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
