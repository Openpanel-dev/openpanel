// Moved from packages/validation/src/index.ts (M11-006, ADR-008's module map:
// organization owns "C" for the member/invite/organization vocabulary).
// `zProjectAccessGrant` is a per-project grant but every consumer is
// organization-shaped (organization.rpc.ts's invite/access mutations,
// code-migrations/20-invite-project-access-levels.ts), so it lives here and
// `zInviteUser` embeds it without a cross-file constants import.
//
// Isomorphic by the AGENTS.md rule: zod and nothing else.

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

export const zEditOrganization = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
  timezone: z.string().min(1),
});
