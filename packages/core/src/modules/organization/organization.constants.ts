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

/**
 * Owner is derived from who created the organization, never assigned. Viewer
 * is not offered until the stored roles are renamed: the previous image does
 * not know it and would give a viewer write access after a rollback.
 */
export const zInvitableRole = z.enum(['admin', 'member']);
export type InvitableRole = z.infer<typeof zInvitableRole>;

const ORGANIZATION_ADMIN_ROLES: ReadonlySet<OrganizationRole> = new Set([
  'owner',
  'admin',
]);

// The spellings the previous build wrote and still compares against. They are
// read and written as-is for one more build so a rolling deploy or rollback
// never turns an admin into a member; the stored rename is the next build's
// migration.
const STORED_ROLE_BY_ROLE: Record<OrganizationRole, string> = {
  owner: 'org:admin',
  admin: 'org:admin',
  member: 'org:member',
  viewer: 'viewer',
};
const ROLE_BY_STORED_ROLE: Record<string, OrganizationRole> = {
  'org:admin': 'admin',
  'org:member': 'member',
};

/** Every stored spelling that counts as an organization admin, for database filters. */
export const STORED_ADMIN_ROLES = ['org:admin', 'admin', 'owner'] as const;

export function normalizeOrganizationRole(stored: string): OrganizationRole {
  const mapped = ROLE_BY_STORED_ROLE[stored];
  if (mapped) {
    return mapped;
  }
  const parsed = zOrganizationRole.safeParse(stored);
  return parsed.success ? parsed.data : 'member';
}

export function toStoredOrganizationRole(role: OrganizationRole): string {
  return STORED_ROLE_BY_ROLE[role];
}

/**
 * The role a membership row resolves to. The organization's creator is its
 * owner; the stored row still says admin until the next build's migration.
 */
export function resolveOrganizationRole(member: {
  role: string;
  userId: string | null;
  organization: { createdByUserId: string | null };
}): OrganizationRole {
  const role = normalizeOrganizationRole(member.role);
  const isCreator =
    member.userId !== null &&
    member.userId === member.organization.createdByUserId;
  return role === 'admin' && isCreator ? 'owner' : role;
}

export function isOrganizationAdminRole(role: OrganizationRole): boolean {
  return ORGANIZATION_ADMIN_ROLES.has(role);
}

/**
 * `all` follows projects created later. `selected` means exactly the listed
 * projects, and an empty list is no project at all.
 */
export const zProjectScope = z.enum(['all', 'selected']);
export type ProjectScope = z.infer<typeof zProjectScope>;

export const zMemberProjectAccess = z.object({
  projectScope: zProjectScope,
  access: z.array(zProjectAccessGrant),
});

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
