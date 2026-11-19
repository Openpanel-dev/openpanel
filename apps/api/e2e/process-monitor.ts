/**
 * RSS/CPU sampling for an arbitrary local process.
 *
 * Prefers the pid file written per role at `$V1_HARNESS_RUN_DIR/<label>.pid`
 * (default `/tmp/openpanel-v1-harness`), since that's the exact process a
 * harness-managed run boots. Falls back to resolving the pid from the TCP
 * listen socket on the role's port for any other way of starting the stack
 * (e.g. `pnpm dev`), where no pid file exists.
 *
 * Pure `/proc` reads: no `ps`/`lsof` shell-outs, no Node-only API beyond
 * `node:fs` (which Bun implements natively), so the identical sampler can
 * profile a Bun-run api/worker later without changes.
 */

import { readdir, readFile, readlink } from 'node:fs/promises';

// USER_HZ is fixed at 100 in the glibc ABI on x86_64/arm64 Linux regardless
// of kernel CONFIG_HZ, which is what makes utime/stime in /proc/[pid]/stat
// (measured in clock ticks) convertible to seconds without reading
// sysconf(_SC_CLK_TCK) via a native call.
const CLK_TCK_HZ = 100;

const PROC_NET_TCP_FILES = ['/proc/net/tcp', '/proc/net/tcp6'];
const TCP_STATE_LISTEN = '0A';

const V1_HARNESS_RUN_DIR =
  process.env.V1_HARNESS_RUN_DIR || '/tmp/openpanel-v1-harness';

async function isAlive(pid: number): Promise<boolean> {
  return (
    (await readFile(`/proc/${pid}/status`, 'utf8').catch(() => null)) !== null
  );
}

/** Resolve the pid recorded for `label` ('api' | 'worker') in the harness pid file, if live. */
async function resolvePidFromHarnessFile(
  label: string
): Promise<number | null> {
  const raw = await readFile(
    `${V1_HARNESS_RUN_DIR}/${label}.pid`,
    'utf8'
  ).catch(() => null);
  const pid = raw ? Number(raw.trim()) : Number.NaN;
  if (Number.isNaN(pid) || !(await isAlive(pid))) {
    return null;
  }
  return pid;
}

async function findListenSocketInode(port: number): Promise<string | null> {
  const wantedPortHex = port.toString(16).toUpperCase().padStart(4, '0');
  for (const file of PROC_NET_TCP_FILES) {
    const content = await readFile(file, 'utf8').catch(() => null);
    if (!content) {
      continue;
    }
    for (const line of content.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) {
        continue;
      }
      const [, portHex] = (cols[1] ?? '').split(':');
      if (portHex === wantedPortHex && cols[3] === TCP_STATE_LISTEN) {
        return cols[9] ?? null;
      }
    }
  }
  return null;
}

async function findPidOwningInode(inode: string): Promise<number | null> {
  const target = `socket:[${inode}]`;
  const pidDirs = await readdir('/proc').catch(() => [] as string[]);
  for (const pidStr of pidDirs) {
    if (!/^\d+$/.test(pidStr)) {
      continue;
    }
    const fdDir = `/proc/${pidStr}/fd`;
    const fds = await readdir(fdDir).catch(() => null);
    if (!fds) {
      continue; // not ours / already gone
    }
    for (const fd of fds) {
      const link = await readlink(`${fdDir}/${fd}`).catch(() => null);
      if (link === target) {
        return Number(pidStr);
      }
    }
  }
  return null;
}

/** Resolve the pid of the process listening on `port` on localhost. */
export async function resolvePidByPort(port: number): Promise<number | null> {
  const inode = await findListenSocketInode(port);
  if (!inode) {
    return null;
  }
  return findPidOwningInode(inode);
}

async function readRssKb(pid: number): Promise<number | null> {
  const status = await readFile(`/proc/${pid}/status`, 'utf8').catch(
    () => null
  );
  if (!status) {
    return null;
  }
  const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
  return match?.[1] ? Number(match[1]) : null;
}

/** utime + stime, in clock ticks (not yet converted to seconds). */
async function readCpuTicks(pid: number): Promise<number | null> {
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => null);
  if (!stat) {
    return null;
  }
  // comm (field 2) is user-controlled and may contain "(" / ")" / spaces;
  // the last ")" is always the end of comm, per proc(5).
  const afterComm = stat.slice(stat.lastIndexOf(')') + 1).trim();
  const fields = afterComm.split(/\s+/);
  // fields[0] is field 3 (state); utime is field 14, stime is field 15.
  const utime = Number(fields[14 - 3]);
  const stime = Number(fields[15 - 3]);
  if (Number.isNaN(utime) || Number.isNaN(stime)) {
    return null;
  }
  return utime + stime;
}

export interface ProcessSample {
  t: number;
  rssKb: number;
  cpuPct: number | null;
}

export interface ProcessSummary {
  label: string;
  pid: number | null;
  sampleCount: number;
  peakRssKb: number | null;
  steadyRssKb: number | null; // median across samples
  peakCpuPct: number | null;
  steadyCpuPct: number | null; // median across samples
}

const median = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
};

/** Samples RSS + CPU% for one process at >=1Hz until `stop()`. */
export class ProcessMonitor {
  private pid: number | null = null;
  private readonly samples: ProcessSample[] = [];
  private lastCpuTicks: number | null = null;
  private lastSampleAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly label: string,
    private readonly port: number
  ) {}

  async start(intervalMs = 1000): Promise<void> {
    this.pid =
      (await resolvePidFromHarnessFile(this.label)) ??
      (await resolvePidByPort(this.port));
    if (this.pid === null) {
      console.warn(
        `   ⚠ process-monitor: could not resolve pid for ${this.label} on port ${this.port} — RSS/CPU will be unavailable`
      );
      return;
    }
    await this.sampleOnce();
    this.timer = setInterval(() => {
      this.sampleOnce().catch(() => {
        // A missed tick (process gone, transient /proc read failure) just
        // means one fewer sample; the run shouldn't die over it.
      });
    }, intervalMs);
  }

  private async sampleOnce(): Promise<void> {
    if (this.pid === null) {
      return;
    }
    const now = Date.now();
    const [rssKb, cpuTicks] = await Promise.all([
      readRssKb(this.pid),
      readCpuTicks(this.pid),
    ]);
    if (rssKb === null || cpuTicks === null) {
      return; // process gone this tick
    }
    let cpuPct: number | null = null;
    if (this.lastCpuTicks !== null && this.lastSampleAt !== null) {
      const deltaTicks = cpuTicks - this.lastCpuTicks;
      const deltaSeconds = (now - this.lastSampleAt) / 1000;
      if (deltaSeconds > 0) {
        cpuPct = (deltaTicks / CLK_TCK_HZ / deltaSeconds) * 100;
      }
    }
    this.lastCpuTicks = cpuTicks;
    this.lastSampleAt = now;
    this.samples.push({ t: now, rssKb, cpuPct });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = null;
  }

  summary(): ProcessSummary {
    const rss = this.samples.map((s) => s.rssKb);
    const cpu = this.samples
      .map((s) => s.cpuPct)
      .filter((c): c is number => c !== null);
    return {
      label: this.label,
      pid: this.pid,
      sampleCount: this.samples.length,
      peakRssKb: rss.length ? Math.max(...rss) : null,
      steadyRssKb: median(rss),
      peakCpuPct: cpu.length ? Math.max(...cpu) : null,
      steadyCpuPct: median(cpu),
    };
  }
}

const mbFmt = (kb: number | null) =>
  kb === null ? 'n/a' : `${(kb / 1024).toFixed(1)}MB`;
const pctFmt = (pct: number | null) =>
  pct === null ? 'n/a' : `${pct.toFixed(1)}%`;

export function formatProcessSummary(s: ProcessSummary): string {
  return (
    `${s.label} (pid=${s.pid ?? 'unresolved'}, ${s.sampleCount} samples): ` +
    `RSS peak=${mbFmt(s.peakRssKb)} steady=${mbFmt(s.steadyRssKb)}, ` +
    `CPU peak=${pctFmt(s.peakCpuPct)} steady=${pctFmt(s.steadyCpuPct)}`
  );
}
