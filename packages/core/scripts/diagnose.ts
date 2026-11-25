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

const pid = values.pid ? Number(values.pid) : DEFAULT_PID;
const timeoutSeconds = values.timeout
  ? Number(values.timeout)
  : DEFAULT_TIMEOUT_SECONDS;

try {
  const responsePath = await requestDiagnostics(
    pid,
    parsed.data,
    timeoutSeconds * MS_PER_SECOND
  );
  await Bun.write(Bun.stdout, Bun.file(responsePath));
  await rm(responsePath, { force: true });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
