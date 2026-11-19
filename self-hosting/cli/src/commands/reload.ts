import { log as clackLog } from '@clack/prompts';
import { type Finding, runDoctor } from '../doctor';
import type { Install } from '../doctor/types';
import { isInstallDir, loadInstall } from '../install';
import { SEVERITY_LABEL } from '../ui';
import { compose } from './compose';

const ENV_CHECK_PREFIX = 'env/';

// Problems in .env that would stop the api from booting. Checked before
// anything restarts, so a typo does not take a running install down.
export const envBlockers = (install: Install): Finding[] =>
  runDoctor(install).filter(
    (finding) =>
      finding.id.startsWith(ENV_CHECK_PREFIX) && finding.severity === 'error'
  );

// `docker compose restart` keeps a container's old environment; `up -d`
// recreates exactly the services whose configuration changed (a new .env
// value, an edited docker-compose.yml) and leaves the rest, databases
// included, running.
export const reload = async (dir: string): Promise<number> => {
  if (!isInstallDir(dir)) {
    clackLog.error(`${dir} is not an OpenPanel install.`);
    return 1;
  }
  const blockers = envBlockers(loadInstall(dir));
  if (blockers.length > 0) {
    for (const finding of blockers) {
      clackLog.message(`${SEVERITY_LABEL[finding.severity]} ${finding.title}`);
    }
    clackLog.error(
      'Fix these in .env first (details: `openpanel doctor`). Nothing was restarted.'
    );
    return 1;
  }
  clackLog.info(
    'Applying changes to .env and docker-compose.yml. Only services whose configuration changed are recreated.'
  );
  return compose('up', dir);
};
