import { execFileSync } from 'node:child_process';

export const git = (...args: string[]): string =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }).trim();

// Absent refs are normal here (no earlier tag), so they return null rather than throw.
export const gitOrNull = (...args: string[]): string | null => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};

export const lines = (text: string | null): string[] =>
  (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
