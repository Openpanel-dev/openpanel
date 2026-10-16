import { defineConfig } from 'vitest/config';

/**
 * Deliberately empty, and it has to exist.
 *
 * Without a config here, vitest searches upward from the working directory and
 * adopts the first one it finds. A worktree under `.worktrees/` sits inside the
 * main checkout, so it picks up that checkout's root config — which, whenever
 * the main checkout has V1 checked out, means a `globalSetup` of
 * `./test/global-setup.ts` (a file this branch deleted) and a project glob of
 * `packages/*` + `apps/*`. The run then fails with a missing module and a
 * dozen projects that have no vitest tests, for reasons nothing in this branch
 * can explain.
 *
 * The project list stays in vitest.workspace.ts: `test.projects` is a vitest
 * 3.2 feature and this repo is on 3.1.3, where the key is silently ignored and
 * every workspace gets collected instead (212 files, 205 of them failing).
 */
export default defineConfig({});
