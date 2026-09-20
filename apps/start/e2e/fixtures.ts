import { test as base } from '@playwright/test';
import { readSeedManifest, type SeedManifest } from './seed-manifest';

export const test = base.extend<{ seed: SeedManifest }>({
  // Playwright requires the destructured first argument, even when unused.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature
  seed: async ({}, use) => {
    await use(readSeedManifest());
  },
});

export { expect } from '@playwright/test';
