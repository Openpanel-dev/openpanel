import { spawn } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
}

const MISSING_BINARY_CODE = 127;

// `inherit` streams straight to the terminal (up, logs); otherwise output is
// captured for the caller to inspect. A missing binary resolves like a failed
// command instead of throwing, so host checks can report it.
export const run = (
  command: string[],
  options: { cwd?: string; inherit?: boolean } = {}
): Promise<RunResult> =>
  new Promise((resolve) => {
    const [binary = '', ...args] = command;
    const child = spawn(binary, args, {
      cwd: options.cwd,
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', () => resolve({ code: MISSING_BINARY_CODE, stdout }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout }));
  });
