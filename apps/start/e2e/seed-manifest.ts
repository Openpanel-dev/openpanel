// The seed's `.seed.json` at the repo root: who to log in as and which
// projects carry data. `bun run seed` writes it.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SeedManifest {
  user: { email: string; password: string };
  organizationId: string;
  rootClient: { id: string; secret: string };
  projects: {
    id: string;
    name: string;
    archetype: string;
    clientId: string;
    clientSecret: string;
    sessions: number;
    events: number;
  }[];
  range: { from: string; to: string };
}

const MANIFEST_PATH = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '.seed.json'
);

export function readSeedManifest(): SeedManifest {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `No ${MANIFEST_PATH}. Run \`bun run seed\` first; the e2e suite logs in with what it seeded.`
    );
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as SeedManifest;
}

/** The seeded project with the most sessions; the overview specs look at it. */
export function busiestProject(
  manifest: SeedManifest
): SeedManifest['projects'][number] {
  const [first, ...rest] = manifest.projects;
  if (!first) {
    throw new Error('.seed.json lists no projects');
  }
  return rest.reduce(
    (best, project) => (project.sessions > best.sessions ? project : best),
    first
  );
}
