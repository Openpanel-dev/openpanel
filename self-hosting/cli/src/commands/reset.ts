import { basename } from 'node:path';
import { cancel, log as clackLog, isCancel, text } from '@clack/prompts';
import { isInstallDir } from '../install';
import { run } from '../run';
import { bold, red } from '../ui';

// Caddy keeps its certificates here. Deleting them on every reset would
// re-request certificates and can hit Let's Encrypt rate limits.
const KEPT_VOLUME_PREFIX = 'op-proxy';

export interface ResetFlags {
  dir: string;
  yes: boolean;
}

const composeOutput = async (dir: string, args: string[]): Promise<string> => {
  const { code, stdout } = await run(['docker', 'compose', ...args], {
    cwd: dir,
  });
  if (code !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed in ${dir}`);
  }
  return stdout.trim();
};

// Compose labels every volume with its project and key, so this finds exactly
// this install's volumes, whatever the project happens to be called.
const volumeIds = async (project: string, key: string): Promise<string[]> => {
  const { stdout } = await run([
    'docker',
    'volume',
    'ls',
    '-q',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--filter',
    `label=com.docker.compose.volume=${key}`,
  ]);
  return stdout.split('\n').filter(Boolean);
};

// Scoped to this install on purpose: a host-wide `docker volume prune` / `image prune` deletes other projects' data.
export const reset = async ({ dir, yes }: ResetFlags): Promise<number> => {
  if (!isInstallDir(dir)) {
    clackLog.error(`${dir} is not an OpenPanel install.`);
    return 1;
  }

  const project = (
    JSON.parse(await composeOutput(dir, ['config', '--format', 'json'])) as {
      name: string;
    }
  ).name;
  const dataVolumes = (await composeOutput(dir, ['config', '--volumes']))
    .split('\n')
    .filter((key) => key && !key.startsWith(KEPT_VOLUME_PREFIX));

  const confirmation = basename(dir);
  clackLog.warn(
    `${red(bold('This deletes all OpenPanel data in this install'))}: ${dataVolumes.join(', ')}.\nKept: docker-compose.yml, .env and Caddy's certificates. Export first if you need the events: openpanel export`
  );
  if (!yes) {
    const typed = await text({ message: `Type "${confirmation}" to continue` });
    if (isCancel(typed) || typed !== confirmation) {
      cancel('Nothing was deleted.');
      return 1;
    }
  }

  const down = await run(['docker', 'compose', 'down', '--remove-orphans'], {
    cwd: dir,
    inherit: true,
  });
  if (down.code !== 0) {
    return down.code;
  }
  for (const key of dataVolumes) {
    const ids = await volumeIds(project, key);
    if (ids.length > 0) {
      await run(['docker', 'volume', 'rm', ...ids], { inherit: true });
    }
  }
  clackLog.success('Wiped. Start fresh with: openpanel up');
  return 0;
};
