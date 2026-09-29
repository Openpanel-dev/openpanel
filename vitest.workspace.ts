/**
 * The workspaces that still run on vitest: the two suites that have never had
 * their own `test` script or `vitest` devDependency and only ran because the
 * previous glob was `packages/*`.
 *
 * An explicit list rather than a glob, so a new package does not silently
 * join the vitest side of the split.
 */
export default ['packages/redis', 'packages/payments'];
