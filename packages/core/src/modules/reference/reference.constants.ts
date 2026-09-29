// Two diverged `zCreateReference` copies were a drift bug this file exists to
// prevent; this is now the only one.

import { z } from 'zod';

export const zCreateReference = z.object({
  title: z.string(),
  description: z.string().nullish(),
  projectId: z.string(),
  datetime: z.string(),
});
