export function printBoxMessage(title: string, lines: (string | unknown)[]) {
  console.log('┌──┐');
  console.log('│');
  if (title) {
    console.log(`│  ${title}`);
    if (lines.length) {
      console.log('│');
    }
  }
  lines.forEach((line) => {
    console.log(`│  ${line}`);
  });
  console.log('│');
  console.log('└──┘');
}

/**
 * The environment this script needs, read by its shell
 * (`packages/core/scripts/migrate-code.ts`) rather than here: nothing under
 * `packages/core/src` reads `process.env` (ADR-022 R7).
 */
export interface CodeMigrationEnv {
  clickhouseCluster: boolean;
  selfHosted: boolean;
  databaseUrl: string | undefined;
  clickhouseUrl: string | undefined;
}

export function getIsCluster(env: CodeMigrationEnv) {
  return process.argv.includes('--cluster') || env.clickhouseCluster;
}

export function getIsSelfHosting(env: CodeMigrationEnv) {
  return env.selfHosted;
}

export function getIsDry() {
  return process.argv.includes('--dry');
}

export function getShouldIgnoreRecord() {
  return process.argv.includes('--no-record');
}
