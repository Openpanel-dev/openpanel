// Moved from packages/validation/src/index.ts (M6-004, ADR-008's module map:
// share owns "C"). packages/validation re-exports these for existing
// @openpanel/validation importers — same shape as
// packages/validation/src/index.ts's onboarding/auth re-exports since M6-003.

import { z } from 'zod';

export const zShareOverview = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  password: z.string().nullable(),
  public: z.boolean(),
});

export const zShareDashboard = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  dashboardId: z.string(),
  password: z.string().nullable(),
  public: z.boolean(),
});

export const zShareReport = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  reportId: z.string(),
  password: z.string().nullable(),
  public: z.boolean(),
});
