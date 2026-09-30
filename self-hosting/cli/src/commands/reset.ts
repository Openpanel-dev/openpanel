import { basename } from 'node:path';
import { cancel, log as clackLog, isCancel, text } from '@clack/prompts';
import { isInstallDir } from '../install';
import { run } from '../run';
import { bold, red } from '../ui';

export interface ResetFlags {
  dir: string;
  yes: boolean;
}

// Scoped to this install's compose project on purpose. The old script also ran
// host-wide `docker volume prune` / `image prune`, which deletes other projects'
// data; `down --volumes` removes only what this stack created.
export const reset = async ({ dir, yes }: ResetFlags): Promise<number> => {
  if (!isInstallDir(dir)) {
    clackLog.error(`No install in ${dir}.`);
    return 1;
  }

  const confirmation = basename(dir);
  clackLog.warn(
    `${red(bold('This deletes all OpenPanel data in this install'))}: Postgres, ClickHouse, Redis and Redpanda volumes.\nYour docker-compose.yml and .env are kept. Export first if you need the events: openpanel export`
  );
  if (!yes) {
    const typed = await text({ message: `Type "${confirmation}" to continue` });
    if (isCancel(typed) || typed !== confirmation) {
      cancel('Nothing was deleted.');
      return 1;
    }
  }

  const { code } = await run(
    ['docker', 'compose', 'down', '--volumes', '--remove-orphans'],
    { cwd: dir, inherit: true }
  );
  if (code === 0) {
    clackLog.success('Wiped. Start fresh with: openpanel up');
  }
  return code;
};
