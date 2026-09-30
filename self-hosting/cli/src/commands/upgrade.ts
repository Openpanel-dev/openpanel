import { cancel, log as clackLog, confirm, isCancel } from '@clack/prompts';
import { applyFixes, type Finding, runDoctor } from '../doctor';
import { checkHost } from '../host';
import { isInstallDir, loadInstall, writeInstall } from '../install';
import { run } from '../run';
import { isCompiledBinary, selfUpdate } from '../self-update';
import { bold, dim, SEVERITY_LABEL } from '../ui';
import { VERSION } from '../version';
import { compose } from './compose';

const DRAIN_FINDING_ID = 'upgrade/drain-old-queue';
const NO_SELF_UPDATE_FLAG = '--no-self-update';

export interface UpgradeFlags {
  dir: string;
  yes: boolean;
  noSelfUpdate: boolean;
}

const ask = async (message: string, yes: boolean): Promise<boolean> => {
  if (yes) {
    return true;
  }
  const answer = await confirm({ message, initialValue: false });
  if (isCancel(answer)) {
    cancel('Cancelled. Nothing was changed.');
    process.exit(0);
  }
  return answer;
};

// Returns an exit code when the CLI replaced itself and the new one took over,
// so the doctor checks and templates that run are the new release's.
const updateSelf = async (): Promise<number | null> => {
  try {
    const result = await selfUpdate({
      currentVersion: VERSION,
      execPath: process.execPath,
      fetcher: fetch,
    });
    if (result.status === 'current') {
      return null;
    }
    clackLog.success(`Updated the CLI ${result.from} → ${result.to}`);
    const args = [...process.argv.slice(2), NO_SELF_UPDATE_FLAG];
    return (await run([process.execPath, ...args], { inherit: true })).code;
  } catch (error) {
    // Offline or rate-limited: upgrading the stack with this version still works.
    clackLog.warn(`Skipped CLI self-update: ${(error as Error).message}`);
    return null;
  }
};

const listFindings = (findings: Finding[]) => {
  for (const finding of findings) {
    clackLog.message(`${SEVERITY_LABEL[finding.severity]} ${finding.title}`);
  }
};

export const upgrade = async (flags: UpgradeFlags): Promise<number> => {
  if (!flags.noSelfUpdate && isCompiledBinary()) {
    const handedOver = await updateSelf();
    if (handedOver !== null) {
      return handedOver;
    }
  }

  if (!isInstallDir(flags.dir)) {
    clackLog.error(`No install in ${flags.dir}. Run \`openpanel init\` first.`);
    return 1;
  }
  const hostProblems = (await checkHost()).filter(
    (check) => !check.ok && check.id !== 'host/memory'
  );
  if (hostProblems.length > 0) {
    for (const problem of hostProblems) {
      clackLog.error(
        `${problem.title}${problem.hint ? `\n  ${dim(problem.hint)}` : ''}`
      );
    }
    return 1;
  }

  const install = loadInstall(flags.dir);
  const findings = runDoctor(install);

  if (findings.some((finding) => finding.id === DRAIN_FINDING_ID)) {
    clackLog.warn(
      `${bold('Upgrading from v1.')} Events still queued in Redis are not moved to Redpanda. Stop tracking traffic and let the old worker drain first.`
    );
    if (!(await ask('Has the old event queue drained?', flags.yes))) {
      clackLog.info('Come back once it has. Nothing was changed.');
      return 1;
    }
  }

  const fixable = findings.filter((finding) => finding.fix);
  if (fixable.length > 0) {
    listFindings(fixable);
    if (
      !(await ask(
        `Apply ${fixable.length} fix(es)? Originals are kept as <name>.bak`,
        flags.yes
      ))
    ) {
      return 1;
    }
    applyFixes(install);
    const written = await writeInstall(flags.dir, install);
    clackLog.success(`Updated ${written.join(', ')}`);
  }

  const blocking = findings.filter(
    (finding) => finding.severity === 'error' && !finding.fix
  );
  if (blocking.length > 0) {
    listFindings(blocking);
    clackLog.error(
      'These need you before the stack can start. See `openpanel doctor`.'
    );
    return 1;
  }

  const pulled = await compose('pull', flags.dir);
  if (pulled !== 0) {
    return pulled;
  }
  return compose('up', flags.dir, ['--remove-orphans']);
};
