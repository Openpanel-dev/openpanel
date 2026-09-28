// `zProjectAccessGrant` is a per-project grant but every consumer is
// organization-shaped (organization.rpc.ts's invite/access mutations), so it
// lives here and `zInviteUser` embeds it without a cross-file constants import.
// @openpanel/db's `code-migrations/constants.ts` keeps its own frozen copy of
// the schema — it is not a consumer.

import { z } from 'zod';

/**
 * A per-project grant. `read` means exactly that: the member can look at the
 * project but no mutation will be accepted for it. `admin` is not offered here
 * - destructive operations hang off the organization role instead, so a third
 * project level would be a second way to say `write`.
 */
export const zProjectAccessGrant = z.object({
  projectId: z.string(),
  level: z.enum(['read', 'write']),
});
export type IProjectAccessGrant = z.infer<typeof zProjectAccessGrant>;

export const zInviteUser = z.object({
  email: z.string().email(),
  organizationId: z.string(),
  role: z.enum(['org:admin', 'org:member']),
  access: z.array(zProjectAccessGrant),
});

export const zUpdateMemberAccess = z.object({
  userId: z.string(),
  organizationId: z.string(),
  access: z.array(zProjectAccessGrant),
});

export const DEFAULT_TIMEZONE = 'UTC';

/** True when the runtime's ICU knows the zone (accepts aliases like `Etc/UTC`, `utc`). */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The spelling ICU resolves (`utc` → `UTC`), so one zone has one stored form. */
export function canonicalTimezone(value: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions()
    .timeZone;
}

// An unknown zone stored on the organization used to turn every date-driven
// query in it into `Invalid Date` 500s, so the zone is checked at the door.
export const zTimezone = z
  .string()
  .trim()
  .min(1)
  .refine(isValidTimezone, { message: 'Unknown IANA time zone' })
  .transform(canonicalTimezone);

export const zEditOrganization = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
  timezone: zTimezone,
});
