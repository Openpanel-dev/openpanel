import type { Document } from 'yaml';
import type { EnvFile } from '../env-file';

export type Severity = 'error' | 'warn' | 'info';

// Everything doctor looks at, in memory. Fixes mutate this; the caller decides
// whether to write it back, so `--check` and tests never touch the disk.
export interface Install {
  compose: Document;
  env: EnvFile;
  caddyfile: string | null;
  // Files doctor may create, keyed by path relative to the install dir.
  files: Map<string, string>;
  hasFile: (relativePath: string) => boolean;
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  // Present when doctor can repair it; absent means the user has to act.
  fix?: (install: Install) => void;
  manual?: string;
}

export type Check = (install: Install) => Finding | null;
