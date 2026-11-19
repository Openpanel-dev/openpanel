/**
 * Every path, allowlist and threshold the conformance checks read.
 *
 * They live here rather than inline because two of them are load-bearing
 * carve-outs a reader has to be able to audit without reading the checks:
 * ASSET_LOADER_ALLOWLIST and SANCTIONED_CREATE_SERVICES_SITES.
 */

/** Paths everywhere are repo-relative POSIX. */
export const CORE_SOURCE_ROOT = 'packages/core/src';
export const CORE_SERVICES_FILE = 'packages/core/src/services.ts';
export const CORE_V1_COMPAT_FILE = 'packages/core/src/v1-compat.ts';
export const API_SOURCE_ROOT = 'apps/api/src';

/** Directories a source walk never descends into. */
export const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.output',
  '.vinxi',
  'generated',
]);

/**
 * The only files that may call `createServices(`: the composition root
 * itself, the context builder every transport goes through, the routes'
 * lazy builder, the jobs runtime, and the app's boot. A file outside this
 * list is an offender.
 */
export const SANCTIONED_CREATE_SERVICES_SITES: readonly string[] = [
  'packages/core/src/services.ts',
  'packages/core/src/context.ts',
  'packages/core/src/http/define.ts',
  'packages/core/src/jobs/workers.ts',
  'apps/api/src/main.ts',
];

/**
 * The asset-loader carve-out, and the reason for each entry.
 *
 * This is an ALLOWLIST of exact `file::function` pairs, deliberately NOT a
 * pattern. A pattern ("loaders that touch the filesystem", "loaders under
 * clients/") would let the next `loadWhatever` join the carve-out by accident,
 * which is how 55 loaders happened in the first place. Adding an entry here is
 * an edit a reviewer sees.
 */
export const ASSET_LOADER_ALLOWLIST: readonly {
  file: string;
  functionName: string;
  reason: string;
}[] = [
  // Geo.ts reads a MaxMind.mmdb file from disk on first use. That is an ASSET
  // load: no sibling service, no db/ch/redis handle, nothing the caller already
  // holds.
  {
    file: 'packages/core/src/clients/geo.ts',
    functionName: 'loadDatabase',
    reason:
      'reads a MaxMind .mmdb file from disk on first use - an asset, not a dependency',
  },
  // Flush-exports.ts reads an export cursor ROW on first use. Also data, and it
  // reads it through the db handle it was already handed rather than importing
  // one.
  {
    file: 'packages/core/src/modules/integration/src/flush-exports.ts',
    functionName: 'loadCursor',
    reason:
      'reads an export cursor row on first use - data, not a dependency; the db handle it reads through is the one it was handed',
  },
];

/** Where the access checks are allowed to live. */
export const AUTH_STACK_PATHS: readonly string[] = [
  'packages/core/src/rpc/base.ts',
  'packages/core/src/modules/auth/',
];

export const ACCESS_CHECK_FUNCTION_NAMES = new Set([
  'requireLogin',
  'requireReadAccess',
  'requireWriteAccess',
  'requireAccess',
]);

/** The prefix, and the one app allowed to keep it. */
export const NEXT_PUBLIC_PREFIX = 'NEXT_PUBLIC_';
export const NEXT_PUBLIC_ALLOWED_ROOT = 'apps/public/';

/** Residue markers that must not appear in the source tree. */
export const RESIDUE_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'NEXT_PUBLIC_ prefix', pattern: /NEXT_PUBLIC_/ },
  // \b so `fika` matches the template's name and not, say, `fikan` in prose.
  { label: 'fika template residue', pattern: /\bfika\b/i },
  { label: '_deprecated marker', pattern: /_deprecated/ },
];

/**
 * Constructors that open a connection or build a client. A `new` of one of
 * these, or a call to one of the factory names, at MODULE scope is the
 * violation; inside a factory body it is exactly what core is supposed to do.
 *
 * The name matched is the CONSTRUCTED one, however it is spelled: `new
 * GitHub(...)` and `new Arctic.Google(...)` are the same construction, and a
 * checker that only looked at bare identifiers could not see the second one
 * at all. `checkModuleScopeConstruction` resolves a qualified `new A.B.C()`
 * down to `C` before looking it up here.
 *
 * The OAuth clients (`arctic`) are credential holders rather than sockets, so
 * nothing about them has to be closed — but they are built from config, and
 * one at module scope would freeze a deployment's client id and secret into
 * the import graph.
 */
export const CONNECTION_CONSTRUCTOR_NAMES = new Set([
  'Redis',
  'RedisClient',
  'Cluster',
  'PrismaClient',
  'ClickHouseClient',
  'S3Client',
  'Kafka',
  'Queue',
  'Worker',
  'QueueEvents',
  'WebSocket',
  // arctic's OAuth clients: modules/auth/src/oauth.ts builds all three per
  // call, from `config.auth.*`.
  'GitHub',
  'Google',
]);
export const CONNECTION_FACTORY_NAME_PATTERN =
  /^create(?:[A-Z][A-Za-z]*)?(?:Client|Connection|Redis|Db|Pool)$/;

/**
 * Util basenames that are the same helper under two names. `super-json`
 * in apps/start is core's `shared/json`; without the alias a basename check
 * reads them as two unrelated files and undercounts the duplication by one.
 */
export const UTIL_BASENAME_ALIASES = new Map([['super-json', 'json']]);

/**
 * Where a "dumb utility" lives today: an app's `src/utils/`, core's
 * `shared/` drawer, or a package's own top level (`packages/redis/json.ts`).
 */
export const UTIL_DIRECTORY_PATTERNS: readonly RegExp[] = [
  /^apps\/[^/]+\/src\/utils\/[^/]+\.ts$/,
  /^packages\/core\/src\/shared\/[^/]+\.ts$/,
  /^packages\/[^/]+\/[^/]+\.ts$/,
];

/**
 * A package's entrypoint is not a utility. Every package has one, so
 * without this the basename check reports six `index.ts` "duplicates" and
 * buries the five real copies.
 */
export const UTIL_BASENAME_EXCLUSIONS = new Set([
  'index',
  'types',
  'constants',
]);

export const SHARED_PACKAGE_NAME = '@openpanel/shared';
export const SHARED_PACKAGE_ROOT = 'packages/shared';

/**
 * Delegated to dependency-cruiser. These are the rule names whose violation
 * counts this gate reports.
 */
export const CRUISER_LAYER_RULE_NAMES: readonly string[] = [
  'core-layers-shared-is-the-bottom',
  'core-layers-clients-below-transport',
  'core-layers-transport-below-modules',
  'core-layers-modules-below-composition',
  'core-layers-composition-below-registries',
  'core-layers-registries-below-index',
];

/** Delegated to the cruiser rule that already ships. */
export const CRUISER_FRONTEND_RULE_NAME = 'frontend-values-only-constants';

/**
 * These two slices are narrower than the cruiser rules that produce them,
 * so the gate prints both: the cruiser's own per-rule count (the delegated
 * number) and the baseline slice, computed from the cruiser's own edges
 * rather than re-derived.
 */
export const R22_SHARED_UPWARD_RULE = 'core-layers-shared-is-the-bottom';
export const R22_TRANSPORT_UPWARD_RULE = 'core-layers-transport-below-modules';
export const R22_TRANSPORT_UPWARD_FROM =
  /^packages\/core\/src\/(?:http\/|rpc\/base\.ts)/;
export const R22_TRANSPORT_UPWARD_TO =
  /^packages\/core\/src\/modules\/[^/]+\/src\//;

/** How many offenders a report block prints before summarising the rest. */
export const MAX_OFFENDERS_PRINTED = 400;
