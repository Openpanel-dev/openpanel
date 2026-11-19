import { z } from 'zod';

export const zCreateReference = z.object({
  title: z.string(),
  description: z.string().nullish(),
  projectId: z.string(),
  datetime: z.string(),
});

// The /manage REST contract, kept to what API consumers already send.
export const zManageCreateReference = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  datetime: z.string(),
});

export const zManageUpdateReference = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  datetime: z.string().optional(),
});
