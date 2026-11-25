// Ask a running OpenPanel process for memory diagnostics, from inside its
// container. The answer goes to stdout, so it can be pulled from outside:
//
//   docker exec <container> bun run diagnose snapshot > snapshot.json
//   docker exec <container> bun run diagnose gc
//   docker exec <container> bun run diagnose heap-snapshot > heap.heapsnapshot
//
// Options: --top <n> (snapshot object types), --pid <n> (default 1, the app in
// the image), --timeout <seconds>.

import { rm } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  requestDiagnostics,
  zDiagnosticsRequest,
} from '../src/shared/diagnostics';

const DEFAULT_PID = 1;
const DEFAULT_TIMEOUT_SECONDS = 300;
const MS_PER_SECOND = 1000;
const USAGE =
  'usage: diagnose <snapshot|gc|heap-snapshot> [--top <n>] [--pid <n>] [--timeout <seconds>]';

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    top: { type: 'string' },
    pid: { type: 'string' },
    timeout: { type: 'string' },
  },
  allowPositionals: true,
});

const parsed = zDiagnosticsRequest.safeParse({
  command: positionals[0],
  ...(values.top && { top: Number(values.top) }),
});
if (!parsed.success) {
  console.error(USAGE);
  process.exit(2);
}

const pid = values.pid === undefined ? DEFAULT_PID : Number(values.pid);
const timeoutMs =
  values.timeout === undefined
    ? DEFAULT_TIMEOUT_SECONDS * MS_PER_SECOND
    : Number(values.timeout) * MS_PER_SECOND;
const pidIsValid = Number.isSafeInteger(pid) && pid > 0;
const timeoutIsValid =
  values.timeout?.trim() !== '' && Number.isFinite(timeoutMs) && timeoutMs > 0;
if (!(pidIsValid && timeoutIsValid)) {
  console.error(USAGE);
  process.exit(2);
}

try {
  const responsePath = await requestDiagnostics(pid, parsed.data, timeoutMs);
  try {
    await Bun.write(Bun.stdout, Bun.file(responsePath));
  } finally {
    await rm(responsePath, { force: true });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
