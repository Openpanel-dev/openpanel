import { run } from '../run';

const ARGS = {
  up: ['up', '-d'],
  down: ['down'],
  restart: ['up', '-d', '--force-recreate'],
  logs: ['logs', '-f', '--tail', '200'],
  status: ['ps'],
} as const;

export type ComposeCommand = keyof typeof ARGS;

export const isComposeCommand = (name: string): name is ComposeCommand =>
  name in ARGS;

// `restart` recreates so a changed .env is picked up; plain `docker compose
// restart` keeps the old environment, which is what bit ./restart before.
export const compose = async (
  command: ComposeCommand,
  dir: string,
  extra: string[] = []
): Promise<number> => {
  const { code } = await run(
    ['docker', 'compose', ...ARGS[command], ...extra],
    {
      cwd: dir,
      inherit: true,
    }
  );
  return code;
};
