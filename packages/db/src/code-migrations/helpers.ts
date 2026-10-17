import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// `shortId` is copied from @openpanel/shared's id.ts to keep code-migrations
// isolated (see constants.ts). Same nanoid/non-secure alphabet and length, so
// migration-written ids match the app's.
const SHORT_ID_ALPHABET =
  'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
const SHORT_ID_ALPHABET_SIZE = 64;
const SHORT_ID_LENGTH = 4;

export function shortId(): string {
  let id = '';
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    id += SHORT_ID_ALPHABET[Math.floor(Math.random() * SHORT_ID_ALPHABET_SIZE)];
  }
  return id;
}

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
 * The environment migrations need, read by `packages/db/scripts/migrate-code.ts`.
 */
export interface CodeMigrationEnv {
  clickhouseCluster: boolean;
  selfHosted: boolean;
  databaseUrl: string | undefined;
  clickhouseUrl: string | undefined;
}

const CREDENTIAL_QUERY_PARAMS = new Set(['password', 'sslpassword', 'user']);

/**
 * Connection URLs carry credentials; the startup banner must not put them in
 * container and CI logs. Keeps scheme, host, port and database, drops the
 * rest. ClickHouse accepts a comma-separated list, so each URL is handled.
 */
export function redactConnectionUrls(value: string | undefined): string {
  if (!value) {
    return '(not set)';
  }
  return value
    .split(',')
    .map((raw) => {
      try {
        const url = new URL(raw.trim());
        const params = new URLSearchParams(url.search);
        for (const key of [...params.keys()]) {
          if (CREDENTIAL_QUERY_PARAMS.has(key.toLowerCase())) {
            params.set(key, '***');
          }
        }
        const query = params.toString();
        const auth = url.username ? '***@' : '';
        return `${url.protocol}//${auth}${url.host}${url.pathname}${query ? `?${query}` : ''}`;
      } catch {
        return '(unparseable url)';
      }
    })
    .join(',');
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

const TRAILING_SEMICOLON = /;$/;
const BLANK_LINE_RUN = /\n{2,}/g;
const STATEMENT_SEPARATOR = '\n\n---\n\n';

/**
 * Dump a migration's ClickHouse statements beside it as `<migration>.sql`, so
 * an operator can read what a run will do. The dumps are build artifacts, not
 * tracked files.
 *
 * Pass `import.meta.url`: it works without Bun's `__filename` polyfill or
 * Node >= 20.11's `import.meta.filename`.
 */
export function writeSqlDump(migrationUrl: string, sqls: string[]) {
  fs.writeFileSync(
    fileURLToPath(migrationUrl).replace('.ts', '.sql'),
    sqls
      .map((sql) =>
        sql
          .trim()
          .replace(TRAILING_SEMICOLON, '')
          .replace(BLANK_LINE_RUN, '\n')
          .concat(';')
      )
      .join(STATEMENT_SEPARATOR)
  );
}
