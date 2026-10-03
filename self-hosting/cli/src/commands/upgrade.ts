import { cancel, log as clackLog, confirm, isCancel } from '@clack/prompts';
import { applyFixes, type Finding, type Install, runDoctor } from '../doctor';
import { IMAGE_TAG_CHECK_ID } from '../doctor/checks';
import { checkHost } from '../host';
import { applyImage, chooseImage, imageDecisions } from '../image-choice';
import { isInstallDir, loadInstall, writeInstall } from '../install';
import { run } from '../run';
import { type Fetcher, isCompiledBinary, selfUpdate } from '../self-update';
import { showSupportBanner } from '../support-banner';
import {
  type Channel,
  channelOf,
  isLoggedIn,
  LOGIN_HINT,
  latestBuildVersion,
  publicVersion,
  SUPPORTER_REGISTRY,
} from '../supporter';
import { STACK_IMAGE_TAG } from '../templates';
import { bold, dim, SEVERITY_LABEL } from '../ui';
import { VERSION } from '../version';
import { compose } from './compose';

const DRAIN_FINDING_ID = 'upgrade/drain-old-queue';
const NO_SELF_UPDATE_FLAG = '--no-self-update';
// Generous: the binary is ~80 MB and some servers sit on slow links.
const SELF_UPDATE_TIMEOUT_MS = 5 * 60 * 1000;
const PERMISSION_ERRORS = new Set(['EACCES', 'EPERM']);

export interface UpgradeFlags {
  dir: string;
  yes: boolean;
  queueDrained: boolean;
  noSelfUpdate: boolean;
  supporter: boolean;
  public: boolean;
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

const fetchWithTimeout: Fetcher = (url) =>
  fetch(url, { signal: AbortSignal.timeout(SELF_UPDATE_TIMEOUT_MS) });

type SelfUpdateOutcome = { kind: 'continue' } | { kind: 'exit'; code: number };

// A newer CLI carries the checks and image tag for the newer stack, so when one
// exists but cannot be installed, stopping beats upgrading with stale knowledge.
const updateSelf = async (
  includePrereleases: boolean
): Promise<SelfUpdateOutcome> => {
  try {
    const result = await selfUpdate({
      currentVersion: VERSION,
      execPath: process.execPath,
      fetcher: fetchWithTimeout,
      includePrereleases,
    });
    if (result.status === 'current') {
      return { kind: 'continue' };
    }
    clackLog.success(`Updated the CLI ${result.from} → ${result.to}`);
    const args = [...process.argv.slice(2), NO_SELF_UPDATE_FLAG];
    const { code } = await run([process.execPath, ...args], { inherit: true });
    return { kind: 'exit', code };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (PERMISSION_ERRORS.has(code)) {
      clackLog.error(
        `A newer CLI is available but ${process.execPath} is not writable.\nRun \`sudo openpanel upgrade\`, or \`openpanel upgrade ${NO_SELF_UPDATE_FLAG}\` to continue with ${VERSION}.`
      );
      return { kind: 'exit', code: 1 };
    }
    // Offline or rate-limited: nothing newer is known, so this version is current enough.
    clackLog.warn(
      `Could not check for a newer CLI: ${(error as Error).message}`
    );
    return { kind: 'continue' };
  }
};

const listFindings = (findings: Finding[]) => {
  for (const finding of findings) {
    clackLog.message(`${SEVERITY_LABEL[finding.severity]} ${finding.title}`);
  }
};

const isBlocking = (finding: Finding) =>
  finding.severity === 'error' && !finding.fix;

// Applies the fixes to a throwaway copy, so problems that a fix resolves (an
// old variable name carrying DASHBOARD_URL) do not count as blockers.
const blockersAfterFixes = (dir: string): Finding[] => {
  const preview = loadInstall(dir);
  applyFixes(preview);
  return runDoctor(preview).filter(isBlocking);
};

const confirmQueueDrained = async (flags: UpgradeFlags): Promise<boolean> => {
  clackLog.warn(
    `${bold('This install predates Redpanda.')} Events still queued in Redis are not moved over. Stop tracking traffic and let the old worker drain first.`
  );
  if (flags.queueDrained) {
    return true;
  }
  // --yes is for routine confirmations; losing queued events is not routine.
  if (flags.yes) {
    clackLog.error('Pass --queue-drained once the old events queue is empty.');
    return false;
  }
  return ask('Has the old event queue drained?', false);
};

// The version this upgrade installs: the newest build for supporters, this
// CLI's own version otherwise. A dev build has none, so it only changes images
// when told to (--public), using the template's tag.
const targetImageVersion = async (
  channel: Channel,
  explicitPublic: boolean
): Promise<string | null> => {
  if (channel === 'supporter') {
    const version = await latestBuildVersion(fetchWithTimeout);
    clackLog.info(
      `Supporter images from ${SUPPORTER_REGISTRY}, newest build: ${version}`
    );
    return version;
  }
  const version = STACK_IMAGE_TAG ?? (explicitPublic ? publicVersion() : null);
  if (version !== null) {
    clackLog.info(`Public release images: ${version}`);
  }
  return version;
};

// An explicit flag switches channel; otherwise the install stays where it is.
const resolveChannel = (flags: UpgradeFlags, install: Install): Channel => {
  if (flags.supporter) {
    return 'supporter';
  }
  if (flags.public) {
    return 'public';
  }
  return channelOf(install);
};

export const upgrade = async (flags: UpgradeFlags): Promise<number> => {
  if (!flags.noSelfUpdate && isCompiledBinary()) {
    // A supporter install runs the newest build's images, so it takes the CLI
    // built alongside them (a pre-release) instead of the last public release.
    const followsBuilds =
      flags.supporter ||
      (!flags.public &&
        isInstallDir(flags.dir) &&
        channelOf(loadInstall(flags.dir)) === 'supporter');
    const outcome = await updateSelf(followsBuilds);
    if (outcome.kind === 'exit') {
      return outcome.code;
    }
  }

  if (!isInstallDir(flags.dir)) {
    clackLog.error(`${flags.dir} is not an OpenPanel install.`);
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

  // Refuse before touching anything, so a stopped upgrade leaves v2 files with
  // v2 containers rather than v3 files with v2 containers.
  const blockers = blockersAfterFixes(flags.dir);
  if (blockers.length > 0) {
    listFindings(blockers);
    clackLog.error(
      'Fix these first (see `openpanel doctor`). Nothing was changed.'
    );
    return 1;
  }

  const install = loadInstall(flags.dir);
  // --supporter / --public switch channels; otherwise an install stays on the
  // one it is on, so a supporter's plain `upgrade` keeps getting the newest build.
  if (flags.supporter && flags.public) {
    clackLog.error('Choose one of --supporter and --public.');
    return 1;
  }
  const channel = resolveChannel(flags, install);
  if (channel === 'supporter' && !isLoggedIn()) {
    clackLog.error(
      `Supporter images need a login to ${SUPPORTER_REGISTRY}.\n${LOGIN_HINT}`
    );
    return 1;
  }
  const version = await targetImageVersion(channel, flags.public);

  const findings = runDoctor(install);

  const needsDrain = findings.some(
    (finding) => finding.id === DRAIN_FINDING_ID
  );
  if (needsDrain && !(await confirmQueueDrained(flags))) {
    clackLog.info('Nothing was changed.');
    return 1;
  }

  // Everything is applied in memory first, so the list below is exactly what
  // gets written, and declining leaves the files untouched.
  // Images are a question (keep, take the new one, or type another) rather
  // than doctor's automatic fix, so an install on its own build or a mirror is
  // never switched without asking.
  const fixable = findings.filter(
    (finding) => finding.fix && finding.id !== IMAGE_TAG_CHECK_ID
  );
  applyFixes(install, { skip: [IMAGE_TAG_CHECK_ID] });
  const imageChanges: string[] = [];
  for (const decision of version === null
    ? []
    : imageDecisions(install, channel, version)) {
    const image = await chooseImage(decision, flags.yes);
    imageChanges.push(...applyImage(install, decision, image));
  }
  const changeCount = fixable.length + imageChanges.length;
  if (changeCount > 0) {
    listFindings(fixable);
    for (const change of imageChanges) {
      clackLog.message(`image ${change}`);
    }
    const approved = await ask(
      `Apply ${changeCount} change(s)? Originals are kept as <name>.bak`,
      flags.yes
    );
    if (!approved) {
      return 1;
    }
    const written = await writeInstall(flags.dir, install);
    clackLog.success(`Updated ${written.join(', ')}`);
  }

  const pulled = await compose('pull', flags.dir);
  if (pulled !== 0) {
    return pulled;
  }
  const started = await compose('up', flags.dir, ['--remove-orphans']);
  if (started === 0) {
    showSupportBanner(install);
  }
  return started;
};
