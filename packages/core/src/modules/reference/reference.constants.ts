// ADR-008 records two diverged `zCreateReference` copies in V1 as one of the
// two drift bugs the dissolution exists to prevent; this is now the only one.

import { z } from 'zod';

export const zCreateReference = z.object({
  title: z.string(),
  description: z.string().nullish(),
  projectId: z.string(),
  datetime: z.string(),
});
