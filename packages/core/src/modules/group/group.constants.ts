import { z } from 'zod';

/**
 * Group ids an event or AI payload may carry. Membership is copied onto every
 * session write, so both the count and the id length are bounded.
 */
export const MAX_GROUPS_PER_EVENT = 100;
export const MAX_GROUP_ID_LENGTH = 256;
export const zEventGroupId = z.string().min(1).max(MAX_GROUP_ID_LENGTH);
export const zEventGroupIds = z.array(zEventGroupId).max(MAX_GROUPS_PER_EVENT);

export const zGroupId = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9_-]+$/,
    'ID must only contain lowercase letters, digits, hyphens, or underscores'
  );

export const zCreateGroup = z.object({
  id: zGroupId,
  projectId: z.string(),
  type: z.string().min(1),
  name: z.string().min(1),
  properties: z.record(z.string(), z.string()).default({}),
});
export type ICreateGroup = z.infer<typeof zCreateGroup>;

export const zUpdateGroup = z.object({
  id: z.string().min(1),
  projectId: z.string(),
  type: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  properties: z.record(z.string(), z.string()).optional(),
});
export type IUpdateGroup = z.infer<typeof zUpdateGroup>;
