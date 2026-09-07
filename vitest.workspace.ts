/**
 * The workspaces that still run on vitest.
 *
 * M12-011 moved `packages/core`, `packages/db` and `apps/api` onto `bun test`
 * (ADR-010) and gave `apps/start` its own vitest config and `test` script, so
 * all four run from their own package. What is left here is the two suites
 * that have never had a `test` script or a `vitest` devDependency of their own
 * and only ever ran because the previous glob was `packages/*`:
 * `packages/redis/cachable.test.ts` (29 tests) and
 * `packages/payments/src/subscription-state.test.ts` (35 tests).
 *
 * Both are outside M12-011's scope. This is an explicit list rather than a
 * glob so that a new package does not silently join the vitest side of the
 * split — the direction of travel is `bun test` (see docs/TECH_DEBT.md,
 * "Test split (M12-011)").
 */
export default ['packages/redis', 'packages/payments'];
