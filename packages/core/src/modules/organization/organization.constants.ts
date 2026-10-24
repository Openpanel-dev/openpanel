import { z } from 'zod';
import { MAX_EMAIL, MAX_ID, MAX_NAME } from '../../shared/limits.constants';

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

/**
 * Organization roles. `owner` and `admin` manage the organization; `member`
 * edits the projects in scope; `viewer` only reads them.
 */
export const ORGANIZATION_ROLES = [
  'owner',
  'admin',
  'member',
  'viewer',
] as const;
export const zOrganizationRole = z.enum(ORGANIZATION_ROLES);
export type OrganizationRole = z.infer<typeof zOrganizationRole>;

/** Owner is whoever created the organization; it is never handed out by invite. */
export const zInvitableRole = z.enum(['admin', 'member', 'viewer']);
export type InvitableRole = z.infer<typeof zInvitableRole>;

/** The roles that manage the organization, also for database filters. */
export const ORGANIZATION_ADMIN_ROLES = [
  'owner',
  'admin',
] as const satisfies readonly OrganizationRole[];

/** An unknown stored role reads as `member`, never as an admin. */
export function normalizeOrganizationRole(stored: string): OrganizationRole {
  const parsed = zOrganizationRole.safeParse(stored);
  return parsed.success ? parsed.data : 'member';
}

const ADMIN_ROLE_SET: ReadonlySet<OrganizationRole> = new Set(
  ORGANIZATION_ADMIN_ROLES
);

export function isOrganizationAdminRole(role: OrganizationRole): boolean {
  return ADMIN_ROLE_SET.has(role);
}

/**
 * `all` follows projects created later. `selected` means exactly the listed
 * projects, and an empty list is no project at all.
 */
export const zProjectScope = z.enum(['all', 'selected']);
export type ProjectScope = z.infer<typeof zProjectScope>;

export const SELECT_A_PROJECT_MESSAGE = 'Select at least one project';

export const zInviteUser = z.object({
  email: z.string().max(MAX_EMAIL).email(),
  organizationId: z.string().max(MAX_ID),
  role: zInvitableRole,
  projectScope: zProjectScope,
  access: z.array(zProjectAccessGrant),
});

export const zUpdateMemberAccess = z.object({
  userId: z.string(),
  organizationId: z.string(),
  projectScope: zProjectScope,
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

// An unknown zone stored on the organization would turn every date-driven
// query in it into `Invalid Date` 500s, so the zone is checked at the door.
export const zTimezone = z
  .string()
  .trim()
  .min(1)
  .refine(isValidTimezone, { message: 'Unknown IANA time zone' })
  .transform(canonicalTimezone);

export const zEditOrganization = z.object({
  id: z.string().min(2).max(MAX_ID),
  name: z.string().trim().min(2).max(MAX_NAME),
  timezone: zTimezone,
});
