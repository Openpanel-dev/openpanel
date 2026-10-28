import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SANDBOX_EXIT_CODE } from './sandbox-protocol';
import { validate } from './validate';

/**
 * Wall-clock budget for one template run inside the sandbox. The validator
 * refuses loops, recursion and calls to template-defined functions, so an
 * honest template finishes in a few milliseconds.
 */
const EXECUTION_TIMEOUT_MS = 250;

/**
 * When the parent SIGKILLs the child: the template budget plus process start
 * (~10 ms idle, more on a busy worker). Catches what the in-child timeout
 * cannot interrupt, such as one huge native `.repeat()` or `.replace()`.
 */
const PROCESS_DEADLINE_MS = 2000;

/** Cap on the serialized output so a template cannot balloon a webhook body. */
const MAX_OUTPUT_BYTES = 1_000_000;

/**
 * Address-space cap (RLIMIT_AS) for the child, Linux only. JSC sizes its heap
 * reservations from the limit and throws "Out of memory" past it. Bun 1.4.4
 * aborts at startup under some smaller caps (768 MiB among them), so change
 * this only together with the sandbox tests, which run under it on Linux.
 */
const MEMORY_LIMIT_KIB = 1024 * 1024;

const SANDBOX_CHILD_PATH = fileURLToPath(
  new URL('./sandbox-child.ts', import.meta.url)
);

/**
 * `ulimit` applies to the shell and survives `exec`, so the cap is in place
 * before Bun starts. A raised oom_score_adj makes the kernel's OOM killer pick
 * the sandbox over the worker if the container runs out regardless.
 */
const LINUX_LIMIT_WRAPPER = `ulimit -v ${MEMORY_LIMIT_KIB} || exit 1; echo 1000 > /proc/self/oom_score_adj 2>/dev/null; exec "$0" "$@"`;

export interface SandboxLimits {
  timeoutMs: number;
  deadlineMs: number;
  maxOutputBytes: number;
}

const DEFAULT_LIMITS: SandboxLimits = {
  timeoutMs: EXECUTION_TIMEOUT_MS,
  deadlineMs: PROCESS_DEADLINE_MS,
  maxOutputBytes: MAX_OUTPUT_BYTES,
};

function sandboxCommand(): [string, string[]] {
  const bunArgs = ['--no-env-file', SANDBOX_CHILD_PATH];
  if (process.platform !== 'linux') {
    return [process.execPath, bunArgs];
  }
  return ['/bin/sh', ['-c', LINUX_LIMIT_WRAPPER, process.execPath, ...bunArgs]];
}

/**
 * Runs an already-validated template in a fresh child process. The child gets
 * an empty environment and a neutral cwd (no `.env`, no bunfig preload), so
 * nothing but the template and the payload crosses into it.
 */
export function runInSandbox(
  code: string,
  payload: Record<string, unknown>,
  limits: SandboxLimits = DEFAULT_LIMITS
): Promise<string> {
  const [command, args] = sandboxCommand();
  const child = spawn(command, args, {
    env: {},
    cwd: tmpdir(),
    stdio: ['pipe', 'pipe', 'ignore'],
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let failure: string | undefined;

    const kill = (reason: string) => {
      failure ??= reason;
      child.kill('SIGKILL');
    };
    const deadline = setTimeout(
      () => kill('Template timed out'),
      limits.deadlineMs
    );

    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > limits.maxOutputBytes) {
        kill('Template output is too large');
        return;
      }
      chunks.push(chunk);
    });
    // The child may die before it has read its input; the exit code reports that.
    child.stdin.on('error', () => undefined);
    child.on('error', (error) => kill(error.message));

    child.on('close', (exitCode, signal) => {
      clearTimeout(deadline);
      const output = Buffer.concat(chunks).toString('utf8');
      if (failure) {
        reject(new Error(failure));
      } else if (exitCode === SANDBOX_EXIT_CODE.ok) {
        resolve(output);
      } else if (exitCode === SANDBOX_EXIT_CODE.templateError) {
        reject(new Error(output));
      } else {
        reject(
          new Error(
            `Template sandbox crashed (${signal ?? `exit ${exitCode}`}), likely by exceeding its memory limit`
          )
        );
      }
    });

    child.stdin.end(
      JSON.stringify({
        code,
        payload,
        timeoutMs: limits.timeoutMs,
        maxOutputBytes: limits.maxOutputBytes,
      })
    );
  });
}

export async function execute(
  code: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  // Re-check at run time: the stored string is what runs, not what passed
  // validation at save time. The child process is the second layer: a
  // validator miss or a runaway allocation can only take the child down.
  const validation = validate(code);
  if (!validation.valid) {
    throw new Error(`Invalid JavaScript template: ${validation.error}`);
  }

  try {
    const resultJson = await runInSandbox(code, payload);
    return resultJson === '' ? undefined : JSON.parse(resultJson);
  } catch (error) {
    throw new Error(
      `Error executing JavaScript template: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
