import { z } from 'zod';

/** Omitted keeps the stored password, null removes it, a string replaces it. */
const zSharePassword = z.string().nullable().optional();

export const zShareOverview = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  password: zSharePassword,
  public: z.boolean(),
});

export const zShareDashboard = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  dashboardId: z.string(),
  password: zSharePassword,
  public: z.boolean(),
});

export const zShareReport = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  reportId: z.string(),
  password: zSharePassword,
  public: z.boolean(),
});
