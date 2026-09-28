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
