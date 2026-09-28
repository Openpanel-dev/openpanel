//
// Isomorphic by the AGENTS.md rule: zod and nothing else.

import { z } from 'zod';

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
