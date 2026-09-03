// Moved from packages/constants/index.ts (M6-002, ADR-008's module map:
// project owns "C"). packages/constants/index.ts becomes a re-export shim of
// `ProjectTypeNames` (same shape as packages/validation/src/import.validation.ts
// since M5-004), so existing @openpanel/constants importers keep resolving it
// unchanged. `zCreateProject`/`zUpdateProject` are the /manage REST body
// schemas (apps/api/src/controllers/manage.controller.ts), moved here with
// the CRUD bodies they validate (project.service.ts's
// createProjectForOrganization/updateProjectForOrganization).
//
// Isomorphic by the AGENTS.md rule: zod and nothing else.

import { z } from 'zod';

export const ProjectTypeNames = {
  website: 'Website',
  app: 'App',
  backend: 'Backend',
} as const;

export const zProjectType = z.enum(['website', 'app', 'backend']);

export const zCreateProject = z.object({
  name: z.string().min(1),
  domain: z.string().url().or(z.literal('')).or(z.null()).optional(),
  cors: z.array(z.string()).default([]),
  crossDomain: z.boolean().optional().default(false),
  types: z.array(zProjectType).optional().default([]),
});

export const zUpdateProject = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().url().or(z.literal('')).or(z.null()).optional(),
  cors: z.array(z.string()).optional(),
  crossDomain: z.boolean().optional(),
  allowUnsafeRevenueTracking: z.boolean().optional(),
});
