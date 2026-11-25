// In-container diagnostics with no HTTP surface: `scripts/diagnose.ts` drops a
// request file into this process's directory and sends DIAGNOSTICS_SIGNAL; the
// answer is written next to it. Whoever can exec into the container can already
// read this process's memory, so the files are the only gate.

import { rmSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  collectGarbage,
  generateHeapSnapshot,
  readMemorySnapshot,
} from './memory';

export const DIAGNOSTICS_SIGNAL = 'SIGUSR2';

const MAX_TOP_OBJECT_TYPES = 200;
const PRIVATE_DIRECTORY_MODE = 0o700;
const POLL_INTERVAL_MS = 100;
const ANSWER_TTL_MS = 10 * 60 * 1000;
const REQUEST_SUFFIX = '.request.json';
const RESPONSE_SUFFIX = '.response';
const ERROR_SUFFIX = '.error';
const PARTIAL_SUFFIX = '.partial';

export const zDiagnosticsRequest = z.discriminatedUnion('command', [
  z.object({
    command: z.literal('snapshot'),
    top: z.number().int().min(1).max(MAX_TOP_OBJECT_TYPES).optional(),
  }),
  z.object({ command: z.literal('gc') }),
  z.object({ command: z.literal('heap-snapshot') }),
]);
export type DiagnosticsRequest = z.infer<typeof zDiagnosticsRequest>;

export interface DiagnosticsLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
}

interface BunFiles {
  file(path: string): {
    json(): Promise<unknown>;
    text(): Promise<string>;
    exists(): Promise<boolean>;
  };
  write(path: string, data: string): Promise<number>;
}

// Typed locally: see the note in ./memory.
function bunFiles(): BunFiles {
  return (globalThis as unknown as { Bun: BunFiles }).Bun;
}

/** Per pid, because a restarted container's PID 1 reuses the same /tmp. */
export function diagnosticsDirectory(pid: number): string {
  return join(tmpdir(), 'openpanel-diagnostics', String(pid));
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Readers poll for the final name, so they never see a half-written file. */
async function writeAtomically(path: string, data: string): Promise<void> {
  await bunFiles().write(`${path}${PARTIAL_SUFFIX}`, data);
  await rename(`${path}${PARTIAL_SUFFIX}`, path);
}

async function runCommand(request: DiagnosticsRequest): Promise<string> {
  switch (request.command) {
    case 'snapshot':
      return JSON.stringify(await readMemorySnapshot(request.top));
    case 'gc':
      return JSON.stringify(await collectGarbage());
    case 'heap-snapshot':
      return generateHeapSnapshot();
    default:
      throw new Error('Unknown diagnostics command');
  }
}

async function handleRequestFile(
  directory: string,
  fileName: string,
  logger: DiagnosticsLogger
): Promise<void> {
  const id = fileName.slice(0, -REQUEST_SUFFIX.length);
  const requestPath = join(directory, fileName);
  const startedAt = performance.now();
  try {
    const raw = await bunFiles().file(requestPath).json();
    await rm(requestPath, { force: true });
    const request = zDiagnosticsRequest.parse(raw);
    await writeAtomically(
      join(directory, `${id}${RESPONSE_SUFFIX}`),
      await runCommand(request)
    );
    logger.info(
      {
        command: request.command,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'Diagnostics request answered'
    );
  } catch (error) {
    await rm(requestPath, { force: true });
    const message = error instanceof Error ? error.message : String(error);
    await writeAtomically(join(directory, `${id}${ERROR_SUFFIX}`), message);
    logger.warn({ err: error }, 'Diagnostics request failed');
  }
}

/** Answers whose caller timed out are never read, so they expire here. */
async function removeExpiredAnswers(
  directory: string,
  fileNames: string[]
): Promise<void> {
  const expiredBefore = Date.now() - ANSWER_TTL_MS;
  for (const fileName of fileNames) {
    if (
      !(fileName.endsWith(RESPONSE_SUFFIX) || fileName.endsWith(ERROR_SUFFIX))
    ) {
      continue;
    }
    const path = join(directory, fileName);
    try {
      if ((await stat(path)).mtimeMs < expiredBefore) {
        await rm(path, { force: true });
      }
    } catch {
      // The caller read and removed it meanwhile.
    }
  }
}

/**
 * Answers diagnostics requests sent to this process. Call once at boot, in
 * every role; returns the function that stops listening.
 */
export async function startDiagnosticsListener(
  logger: DiagnosticsLogger
): Promise<() => void> {
  const directory = diagnosticsDirectory(process.pid);
  let draining = false;
  let signalledWhileDraining = false;

  const drain = async (): Promise<void> => {
    if (draining) {
      signalledWhileDraining = true;
      return;
    }
    draining = true;
    try {
      do {
        signalledWhileDraining = false;
        const fileNames = await readdir(directory);
        await removeExpiredAnswers(directory, fileNames);
        const requests = fileNames.filter((name) =>
          name.endsWith(REQUEST_SUFFIX)
        );
        for (const fileName of requests) {
          await handleRequestFile(directory, fileName, logger);
        }
      } while (signalledWhileDraining);
    } catch (error) {
      logger.warn({ err: error }, 'Diagnostics directory could not be read');
    } finally {
      draining = false;
    }
  };

  const onSignal = () => {
    drain();
  };
  // Handler first: the directory tells callers it is safe to signal.
  process.on(DIAGNOSTICS_SIGNAL, onSignal);
  try {
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  } catch (error) {
    process.off(DIAGNOSTICS_SIGNAL, onSignal);
    throw error;
  }
  return () => {
    rmSync(directory, { recursive: true, force: true });
    process.off(DIAGNOSTICS_SIGNAL, onSignal);
  };
}

export class DiagnosticsTimeoutError extends Error {}

/**
 * Asks process `pid` for a diagnostics answer and returns the path of the
 * response file, which the caller reads and deletes.
 */
export async function requestDiagnostics(
  pid: number,
  request: DiagnosticsRequest,
  timeoutMs: number
): Promise<string> {
  const directory = diagnosticsDirectory(pid);
  const id = crypto.randomUUID();
  const responsePath = join(directory, `${id}${RESPONSE_SUFFIX}`);
  const errorPath = join(directory, `${id}${ERROR_SUFFIX}`);
  const requestPath = join(directory, `${id}${REQUEST_SUFFIX}`);

  // The signal's default action terminates, so a process without the listener
  // (an older image) must never receive it; the directory proves the listener.
  if (!(await directoryExists(directory))) {
    throw new Error(
      `pid ${pid} is not listening for diagnostics (no ${directory}): not an OpenPanel process, or one started before diagnostics existed`
    );
  }
  await writeAtomically(requestPath, JSON.stringify(request));
  try {
    process.kill(pid, DIAGNOSTICS_SIGNAL);
  } catch (error) {
    await rm(requestPath, { force: true });
    throw error;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await bunFiles().file(responsePath).exists()) {
      return responsePath;
    }
    if (await bunFiles().file(errorPath).exists()) {
      const message = await bunFiles().file(errorPath).text();
      await rm(errorPath, { force: true });
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  await rm(requestPath, { force: true });
  throw new DiagnosticsTimeoutError(
    `No answer from pid ${pid} within ${timeoutMs} ms`
  );
}
