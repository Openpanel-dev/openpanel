// Moved from packages/validation/src/index.ts (ADR-008's module map: reference
// owns "C"). ADR-008 records two diverged `zCreateReference` copies in V1 as
// one of the two drift bugs the dissolution exists to prevent; this is now the
// only one.
//
// Isomorphic by the AGENTS.md rule: zod and nothing else.

import { z } from 'zod';

export const zCreateReference = z.object({
  title: z.string(),
  description: z.string().nullish(),
  projectId: z.string(),
  datetime: z.string(),
});
