/**
 * A ClickHouse HTTP proxy that lets a fresh-install migration drill run on a
 * box whose `openpanel` database already holds the prod-copy dataset.
 *
 * Why it has to exist: `getExistingTables()`
 * (`packages/db/src/clickhouse/migration.ts`) asks
 * `SELECT name FROM system.tables WHERE database = 'openpanel'` — the database
 * name is a literal, not the one in `CLICKHOUSE_URL` — and `4-add-sessions.ts`
 * writes `INSERT INTO openpanel.sessions ... FROM openpanel.events`. Pointing
 * `CLICKHOUSE_URL` at a scratch database is therefore NOT isolation: the run
 * still reads, and would still write, the real `openpanel`.
 *
 * Modes:
 *   rewrite  every `openpanel` token (URL and body) becomes SCRATCH_DATABASE,
 *            so the migration's own hardcoded name resolves to the scratch
 *            database. This is what a genuinely fresh install looks like.
 *   guard    pass through untouched — used to reproduce a run that points only
 *            CLICKHOUSE_URL at a scratch database — but refuse any statement
 *            that is not a read and still names `openpanel` / `openpanel_test`.
 *
 * Both modes refuse anything naming `openpanel_test`, and every statement is
 * appended to LOG_FILE.
 */

const UPSTREAM_URL = process.env.UPSTREAM_CLICKHOUSE_URL ?? 'http://127.0.0.1:8123';
const LISTEN_PORT = Number(process.env.PROXY_PORT ?? 8199);
const SCRATCH_DATABASE = process.env.SCRATCH_DATABASE ?? '';
const MODE = process.env.PROXY_MODE ?? 'rewrite';
const LOG_FILE = process.env.PROXY_LOG ?? '/tmp/ch-scratch-proxy.log';

// Two spellings of the same token: `.test()` on a /g regex carries lastIndex
// between calls, so the guard gets its own non-global copy.
const PROTECTED_DATABASE_TOKEN_ALL = /\bopenpanel\b/g;
const PROTECTED_DATABASE_TOKEN = /\bopenpanel\b/;
const TEST_DATABASE_TOKEN = /\bopenpanel_test\b/;
const READ_STATEMENT = /^\s*(SELECT|WITH|SHOW|DESC|DESCRIBE|EXISTS|EXPLAIN)\b/i;
const REFUSED_STATUS = 400;

if (MODE === 'rewrite' && !SCRATCH_DATABASE) {
  throw new Error('SCRATCH_DATABASE is required in rewrite mode');
}
if (SCRATCH_DATABASE === 'openpanel' || SCRATCH_DATABASE === 'openpanel_test') {
  throw new Error(`refusing to use ${SCRATCH_DATABASE} as a scratch database`);
}

await Bun.write(LOG_FILE, '');
const logHandle = Bun.file(LOG_FILE).writer();
const append = (line: string) => {
  logHandle.write(`${line}\n`);
  logHandle.flush();
};

/** ClickHouse clients may gzip the request body; rewriting needs the plain text. */
async function readBody(request: Request): Promise<string> {
  const raw = new Uint8Array(await request.arrayBuffer());
  if (request.headers.get('content-encoding') === 'gzip') {
    return new TextDecoder().decode(Bun.gunzipSync(raw));
  }
  return new TextDecoder().decode(raw);
}

const rewrite = (text: string) =>
  MODE === 'rewrite'
    ? text.replace(PROTECTED_DATABASE_TOKEN_ALL, SCRATCH_DATABASE)
    : text;

/**
 * `statement` is the SQL alone — the read/write classification has to look at
 * the query text, not at the URL it arrived on.
 */
const isRefused = (target: string, statement: string) => {
  if (TEST_DATABASE_TOKEN.test(target) || TEST_DATABASE_TOKEN.test(statement)) {
    return 'names openpanel_test';
  }
  if (MODE === 'rewrite') {
    // Nothing may reach ClickHouse still naming the real database.
    return PROTECTED_DATABASE_TOKEN.test(target) ||
      PROTECTED_DATABASE_TOKEN.test(statement)
      ? 'still names openpanel'
      : null;
  }
  if (PROTECTED_DATABASE_TOKEN.test(statement) && !READ_STATEMENT.test(statement)) {
    return 'non-read statement naming openpanel';
  }
  if (PROTECTED_DATABASE_TOKEN.test(target)) {
    return 'request routed at the openpanel database';
  }
  return null;
};

const server = Bun.serve({
  port: LISTEN_PORT,
  hostname: '127.0.0.1',
  idleTimeout: 255,
  async fetch(request) {
    const incoming = new URL(request.url);
    const body = request.method === 'GET' ? '' : await readBody(request);

    const outgoing = new URL(
      rewrite(incoming.pathname + incoming.search),
      UPSTREAM_URL
    );
    const outgoingBody = rewrite(body);
    const target = `${outgoing.pathname}?${outgoing.searchParams.get('database') ?? ''}`;
    const statement = outgoingBody || (outgoing.searchParams.get('query') ?? '');
    const inspected = `${outgoing.pathname}${outgoing.search}\n${outgoingBody}`;

    const refusal = isRefused(target, statement);
    if (refusal) {
      append(`[REFUSED: ${refusal}] ${inspected}`);
      return new Response(`proxy refused request: ${refusal}\n`, {
        status: REFUSED_STATUS,
      });
    }

    append(`[${request.method}] ${outgoing.pathname}${outgoing.search}\n${outgoingBody}`);

    const headers = new Headers(request.headers);
    // The body is rewritten, so any length/encoding the client set is stale.
    headers.delete('content-length');
    headers.delete('content-encoding');

    const response = await fetch(outgoing, {
      method: request.method,
      headers,
      body: request.method === 'GET' ? undefined : outgoingBody,
    });

    // `fetch` already decompressed the upstream body; forwarding ClickHouse's
    // `Content-Encoding: gzip` would make the client decompress it twice.
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
});

append(`--- proxy up mode=${MODE} scratch=${SCRATCH_DATABASE || '(none)'} ---`);
console.log(
  `ch-scratch-proxy listening on http://127.0.0.1:${server.port} mode=${MODE} scratch=${SCRATCH_DATABASE || '(none)'}`
);
