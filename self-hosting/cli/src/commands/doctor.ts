import { applyFixes, type Finding, runDoctor } from '../doctor';
import { checkHost } from '../host';
import { isInstallDir, loadInstall, writeInstall } from '../install';
import { bold, dim, green, log, red, SEVERITY_LABEL } from '../ui';

interface DoctorOptions {
  // null when no install was found; the host checks still run.
  dir: string | null;
  missingMessage: string;
  fix: boolean;
  check: boolean;
}

const printFinding = (finding: Finding) => {
  log(`${SEVERITY_LABEL[finding.severity]}  ${bold(finding.title)}`);
  log(`       ${dim(finding.detail)}`);
  const action = finding.fix ? green('fixable with --fix') : finding.manual;
  if (action) {
    log(`       ${dim('→')} ${action}`);
  }
};

const printHost = async (): Promise<boolean> => {
  const results = await checkHost();
  for (const result of results) {
    log(`${result.ok ? green('ok') : red('!!')}  ${result.title}`);
    if (!result.ok && result.hint) {
      log(`    ${dim(result.hint)}`);
    }
  }
  return results.every((result) => result.ok);
};

const isBlocking = (finding: Finding) =>
  finding.severity === 'error' && !finding.fix;

export const doctor = async ({
  dir,
  missingMessage,
  fix,
  check,
}: DoctorOptions): Promise<number> => {
  log(bold('Host'));
  const hostOk = await printHost();
  log();

  if (dir === null) {
    log(missingMessage);
    return hostOk ? 0 : 1;
  }
  if (!isInstallDir(dir)) {
    log(
      `${dir} is not an OpenPanel install (its docker-compose.yml has no op-api and op-dashboard).`
    );
    return 1;
  }

  const install = loadInstall(dir);
  const findings = runDoctor(install);
  log(bold(`Install (${dir})`));
  if (findings.length === 0) {
    log(`${green('ok')}  Nothing to fix.`);
    return hostOk ? 0 : 1;
  }
  for (const finding of findings) {
    printFinding(finding);
  }
  log();

  const fixable = findings.filter((finding) => finding.fix);
  const blocking = findings.filter((finding) => finding.severity === 'error');

  if (!fix) {
    log(
      fixable.length > 0
        ? `Run \`openpanel doctor --fix\` to repair ${fixable.length} of ${findings.length}.`
        : 'Nothing here can be fixed automatically.'
    );
    const failed = blocking.length > 0 || !hostOk;
    return check && failed ? 1 : 0;
  }

  applyFixes(install);
  const written = await writeInstall(dir, install);
  log(
    green(`Fixed ${fixable.length}. Wrote ${written.join(', ') || 'nothing'}.`)
  );
  if (written.length > 0) {
    log(dim('Originals saved next to each file as <name>.bak.'));
  }
  const manual = findings.filter((finding) => !finding.fix);
  if (manual.length > 0) {
    log(`${manual.length} item(s) still need you — see above.`);
  }
  // Fixed files are not a healthy install while a blocker or the host is broken.
  const stillBlocked = findings.some(isBlocking);
  return stillBlocked || !hostOk ? 1 : 0;
};
