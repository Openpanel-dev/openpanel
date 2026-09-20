export const DEFAULT_SEED = 42;

/** The login every seeded database has; also written to `.seed.json`. */
export const SEED_USER = {
  id: 'user_seed_admin',
  email: 'admin@openpanel.local',
  password: 'openpanel',
  firstName: 'Seed',
  lastName: 'Admin',
} as const;

export const SEED_ORGANIZATION = { id: 'acme', name: 'Acme' } as const;

export const ORGANIZATION_ADMIN_ROLE = 'org:admin';

/** Mirrors the trial the onboarding flow grants, so billing gates behave the same. */
export const TRIAL_DAYS = 365;
export const TRIAL_EVENTS_LIMIT = 100_000_000;

export const SIZE_PRESETS = {
  small: { days: 14, sessionsPerDay: 300 },
  medium: { days: 30, sessionsPerDay: 2000 },
  large: { days: 90, sessionsPerDay: 12_000 },
  xl: { days: 365, sessionsPerDay: 30_000 },
} as const;

export type SizePreset = keyof typeof SIZE_PRESETS;

export const DEFAULT_SIZE: SizePreset = 'small';

/** Rows per ClickHouse insert; JSONEachRow at this size stays well under a second. */
export const INSERT_BATCH_ROWS = 50_000;

/** uuid v5 namespace for every deterministic id the seed mints. */
export const ID_NAMESPACE = '6f5f2b0e-3f7c-4a3e-9c1e-2d0b4a6e8c11';

/** Where `session_start` / `session_end` sit relative to the real events (mirrors the worker). */
export const SESSION_START_OFFSET_MS = 100;
export const SESSION_END_OFFSET_MS = 1000;

/** Returning-visitor pool per project; evicted visitors never come back. */
export const VISITOR_POOL_SIZE = 20_000;

export const MANIFEST_FILE = '.seed.json';
