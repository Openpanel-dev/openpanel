---
name: sdk-testbed
description: Verify a change to the JavaScript SDKs (packages/sdks/sdk, packages/sdks/web and the wrappers built on them) the way a customer site would hit it - drive apps/testbed in a real browser against your local API and check the rows that land in ClickHouse. Use after any SDK change, when the user says "test the sdk", "run the testbed", or asks whether an event is tracked and stored correctly.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

# SDK testbed

`apps/testbed` is a small React shop (`TESTSTORE`) that uses `@openpanel/web`
exactly like a customer site: screen views, custom `track()` calls, identify,
groups, revenue, plus a footer with a `data-track` button and an outgoing link
for the automatic trackers. Vite resolves `@openpanel/web` from the package
*source*, so an SDK edit is live on the next reload; nothing has to be built.

Unit tests (`bun run --filter @openpanel/web test`) prove what the SDK *sends*.
This skill proves what gets *stored*: browser → `POST /track` → Kafka → worker →
ClickHouse `events`, with `path`, `origin`, properties and session as the
dashboard will show them.

## 1. Preflight

- **The API must be running with the worker role** (`ROLE=all`). In a
  worktree it is supervised (`WORKTREE.md`); if the supervisor is gone, start it
  yourself and keep the log:
  `bun run --filter @openpanel/api dev > /tmp/api.log 2>&1 &` then wait for
  `"Boot complete"` in the log. Confirm with `curl -s -o /dev/null -w '%{http_code}' $API_URL_SSR/track`
  (any HTTP answer means it is up).
- **A seeded client.** `.seed.json` (repo root) lists the projects; the config
  picks the `website` one (Acme Web, CORS `*`), which accepts the testbed's
  `http://localhost:<port>` origin. No `.seed.json` → `bun run seed`.
- **A port.** The testbed listens on `TESTBED_PORT`, defaulting to `WEB_PORT + 9`
  in a worktree and `3100` otherwise. Override it if that port is taken.
- Do not reseed, migrate or restart processes from a sub-agent; only the main
  agent does that, before anything else runs.

Everything is read from the shell env (`API_URL_SSR`/`API_URL`, `CLICKHOUSE_URL`,
`WEB_PORT`) and `.seed.json`; the config in `apps/testbed/playwright.config.ts`
is the single place that turns them into `VITE_OPENPANEL_API_URL`,
`VITE_OPENPANEL_CLIENT_ID` and the port.

## 2. Run the journey

```bash
bun run --filter @openpanel/testbed e2e
```

`apps/testbed/e2e/sdk.spec.ts` starts the testbed (or reuses one already up),
clicks through shop → product → data-track button → outgoing link, then polls
ClickHouse until the rows exist and asserts their `path` and properties. A
missing row fails with the list of what *was* stored, which is usually the
whole diagnosis. The trace for a failed run is under
`apps/testbed/test-results/`.

When your change adds behaviour the journey does not cover (a new option, a
new automatic tracker, a payload shape), extend the spec: add the fixture to
`apps/testbed/src` (the footer in `App.tsx` is for the automatic trackers), the
click to the spec, and the assertion on the stored row. The spec is the
regression test for the next person.

## 3. Look yourself

For anything the spec does not say, start the testbed and read ClickHouse
directly. Filter on `origin`, which is the testbed URL, so seeded and other
traffic stay out of the way:

```bash
# Same default as playwright.config.ts: WEB_PORT + 9 in a worktree, 3100 elsewhere.
port=${TESTBED_PORT:-$(( ${WEB_PORT:-3091} + 9 ))}
TESTBED_PORT=$port VITE_OPENPANEL_API_URL=${API_URL_SSR:-http://localhost:3333} \
VITE_OPENPANEL_CLIENT_ID=<website clientId from .seed.json> \
bun run --filter @openpanel/testbed dev > /tmp/testbed.log 2>&1 &

curl -s "${CLICKHOUSE_URL%/*}/?database=${CLICKHOUSE_URL##*/}" --data-binary "
  SELECT name, path, properties, session_id, toString(created_at) AS at
  FROM events
  WHERE origin = 'http://localhost:$port'
  ORDER BY created_at DESC LIMIT 20
  FORMAT PrettyCompactMonoBlock"
```

Use the browser with the Playwright MCP (`browser_*` tools) if you have one,
otherwise a throwaway spec next to `sdk.spec.ts`. Watch `/tmp/api.log` while
clicking: a refused request (`Ingestion: ...`) or a bot verdict is logged there,
not in the browser. `sessions` and `profiles` are the other tables to read
when the change touches identify, groups or session handling.

## What trips people up

- **Events before `ready()` are queued, not lost.** The testbed constructs the
  SDK with `disabled: true` and calls `op.ready()` after restoring the login,
  so the first screen view arrives slightly after page load.
- **`path`/`origin` come from `__path`.** An event without `__path` is stored
  with empty `path` *and* empty `origin`, so it will not match the origin
  filter above. "No rows at all" for an event that reached the API usually
  means the page was missing, not the event.
- **Revenue needs a verified client secret** or the project's
  `allowUnsafeRevenueTracking`; the whole request is refused otherwise. The
  seeded web client has no secret in the browser, so `op.revenue()` from the
  testbed is refused by design.
- **Identical requests within 100 ms are dropped** as the web SDK's known
  double-fire. Two different clicks are fine; a loop firing the same payload is
  not.
- **Latency.** Rows take a few seconds to show up (Kafka, the worker, the
  buffer). Poll with a deadline; never assert right after the click.
- **`op1.js` (the script tag build) is not what the testbed runs.** It uses the
  npm entry. To check the IIFE, `bun run --filter @openpanel/web build` and load
  `packages/sdks/web/dist/src/tracker.global.js` in a page yourself.

## Report

Say what the spec covered, paste the stored rows (names, paths, the properties
that matter) and name anything you could not drive through the testbed.
