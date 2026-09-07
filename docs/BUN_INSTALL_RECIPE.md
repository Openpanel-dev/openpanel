# BUN_INSTALL_RECIPE

How `pnpm install` becomes `bun install` in M13-002, what each line of
`pnpm-workspace.yaml` turns into, and what the swap is forbidden from doing.

**Status: a recipe, not a decision.** ADR-014 (ACCEPTED) is the decision, and
its stop rule governs everything here:

> **any pin that cannot be reproduced ends P13 and the repo stays on pnpm.**

Nothing in this file may be read as permission to make a pin reproduce by
changing what it pins. ADR-017 rule 3 says the same thing from the other side —
P13 lockfile churn is not an upgrade, and the installer swap must not carry a
declared-range change of its own.

Written for M13-001 (2026-09-07), against `pnpm-workspace.yaml` at the commit
that pinned every direct dependency to its resolved version. Numbers are
labelled with who measured them and when; the operator's throwaway-worktree
survey of a bare `bun install` is labelled as such, because this task did not
run `bun install` against this tree.

---

## 0. What M13-001 already did, and why it matters here

Every direct dependency of every workspace importer that declares a version
range now names an **exact** version, except the two lines ADR-017 rule 2
forbids this task from touching. Audited on the pinned tree, 2026-09-07, across
the lock's 20 importers:

| | count |
|---|---:|
| declared ranges, now exact | **306** |
| still a range — the ADR-017 rule 2 carve-out, below | **2** |
| `workspace:` / `catalog:` specifiers, untouched by design | 99 |
| peers auto-installed by pnpm, left as peer ranges by design | 9 |

`tooling/scripts/pin-from-pnpm-lock.ts` did 263 of those rewrites (253 in 20
`package.json` files plus the 10 `catalog:` entries — the other 53 were already
exact), taking every value from what `pnpm-lock.yaml` had already resolved.
**Not one `version:` line in the lock moved**; only its 263 matching
`specifier:` fields were relabelled, and `pnpm install --frozen-lockfile` is
green on the result. The lock is edited rather than regenerated on purpose —
see *Why the lock is edited, not refreshed* below for the measurement.

### The two dependencies that stay a range

`packages/redis/package.json` and `packages/sdks/_info/package.json` each carry
a stale `prisma: ^5.1.1` devDep, a whole major behind the `@prisma/client` /
`prisma` 6.14.0 that `packages/db` actually uses. **ADR-017 rule 2 (ACCEPTED)
names those two lines by path** and rules that they "are to be **deleted, not
aligned to 6.14**" — the ruling is that touching their version at all is the
wrong move, and the deletion belongs to a separate CLEAN task. Rule 3 is the
general P13 pinning permission; rule 2 is a specific, named exception to it, and
a binding ADR outranks the mechanical "pin everything".

So `pin-from-pnpm-lock.ts` carries an explicit, commented exclusion list
(`ADR_017_RULE_2_FROZEN`) for exactly those two entries, and leaves both the
manifest line and its `specifier:` in the lock at `^5.1.1`. `pnpm-lock.yaml`
still resolves both to `prisma@5.9.1`, and
`tooling/gates/p13-lock-snapshot.json` records `5.9.1` for them — the snapshot
is a record of **resolutions**, not of declared ranges, so the drift gate still
holds these two to an exact installed version.

**What M13-002 must know:** these are the only two direct dependencies whose
declared range bun gets to resolve itself. Bun re-resolving `^5.1.1` to a newer
5.x (or the whole `prisma` 5 line vanishing) shows up in `p13-drift.sh` as
drift, not as a silent change. If the CLEAN task deletes them before the swap,
the exclusion list and this section become dead and should go with them; until
then, do not "fix" them in a P13 commit.

That is the precondition for everything below. Bun 1.4.0 **cannot read
`pnpm-lock.yaml`** (operator survey, 2026-09-07) — it re-resolves the whole
graph from the declared ranges — so under carets the swap is an uncontrolled
upgrade of the entire tree (see *Known drift hazards*). A
manifest full of exact versions turns the swap into something a resolver has to
*reproduce* rather than *decide*, and `tooling/gates/p13-drift.sh` is what
checks that it did.

`tooling/gates/p13-lock-snapshot.json` (416 direct dependencies across 20
workspace packages) is the reference, kept as its own committed file precisely
because M13-002 deletes `pnpm-lock.yaml`.

---

## Why the lock is edited, not refreshed

`pin-from-pnpm-lock.ts` writes the manifests, `pnpm-workspace.yaml`'s catalog
**and** the matching `specifier:` lines of `pnpm-lock.yaml`. It does not run
`pnpm install` to have pnpm regenerate the lock, and M13-002 must not either.

The reason is that a non-frozen `pnpm install` does not merely relabel the
specifiers — it re-resolves the whole graph and dedupes it, which moves the
baseline in the same commit that is supposed to prove nothing moved.

**Measured on this box, 2026-09-07**, on the pinned tree, with the manifests
already pinned and only the lock rolled back to `HEAD`'s:

```bash
# from the pinned working tree
cp pnpm-lock.yaml /tmp/lock.pinned.yaml
git show HEAD:pnpm-lock.yaml > pnpm-lock.yaml
pnpm install --lockfile-only          # 24.6s, pnpm 11.23.0
cp pnpm-lock.yaml /tmp/lock.refreshed.yaml
cp /tmp/lock.pinned.yaml pnpm-lock.yaml   # baseline restored
```

Comparing `/tmp/lock.refreshed.yaml` against the committed (edited) lock:

| | |
|---|---:|
| `packages:` entries, edited lock | 3608 |
| `packages:` entries, refreshed lock | 3466 |
| package versions **pruned** by the refresh | **142** |
| package versions **added** by the refresh | **0** |
| distinct package names that lost a duplicate copy | 135 |
| package names that disappeared entirely | 0 |
| changed lines in the lock diff | 3643 |
| of those, `specifier:` lines | **0** |
| importer `version:` lines that changed | 6 |
| direct dependencies whose resolved version changed | **0** |

Counted with:

```bash
count() { awk '/^packages:/{f=1;next} /^[a-z]/{f=0} f && /^  [^ ]/{n++} END{print n+0}' "$1"; }
count /tmp/lock.refreshed.yaml
diff -u /tmp/lock.pinned.yaml /tmp/lock.refreshed.yaml | grep -cE '^[-+]'
```

The 142 prunes are duplicate copies collapsing: every pruned name still has a
surviving copy, and consumers get re-pointed at it. Concretely, `@babel/core`
goes from four copies (7.24.5, 7.28.3, 7.28.5, 7.29.0) to two, `magicast` from
three (0.3.5, 0.5.1, 0.5.3) to two, `semver` from nine to six. That is why the
6 changed importer `version:` lines are peer-resolution **suffix** changes only
— `nuqs@2.5.2(…next@16.0.7(@babel/core@7.28.3…))` becomes
`…(@babel/core@7.29.0…)` — with the base version identical in all six, which is
why the snapshot generated from the refreshed lock is byte-identical to the
committed one.

So the refresh moves no direct dependency, but it does move 142 transitive
resolutions. ADR-014's stop rule is "any pin that cannot be **reproduced**",
and M13-002 measures bun's tree against the pnpm tree; re-deduping the pnpm
tree first means measuring against a baseline nobody ever ran, built or
shipped. Rewriting the `specifier:` fields is the mechanical,
resolution-preserving half of what that install would have done.

**The three proofs that the edit is legitimate**, all verification commands of
M13-001:

```bash
# 1. the lock diff against HEAD touches specifier: lines and nothing else
git diff -U0 -- pnpm-lock.yaml | grep -E '^[-+]' | grep -vE '^(\+\+\+|---)|specifier:'   # prints nothing

# 2. pnpm itself accepts the edited lock as consistent with the manifests
pnpm install --frozen-lockfile                                                            # green

# 3. the installed tree still matches what pnpm had resolved
bash tooling/gates/p13-drift.sh --assert                                                  # exit 0
```

A fourth, not required but worth knowing: on the edited lock a plain
`pnpm install --lockfile-only` reports `Already up to date` and rewrites
nothing, so the hand-edited lock is a fixpoint of pnpm's own resolver rather
than a file pnpm merely tolerates.

---

## 1. Translation table: `pnpm-workspace.yaml` → root `package.json`

Every block of the file is accounted for. Bun has no workspace file; the three
things it does read all live in the root `package.json`.

| `pnpm-workspace.yaml` block | Lines | Becomes | Notes |
|---|---|---|---|
| `packages:` (`apps/*`, `packages/**`, `tooling/*`) | 1–4 | `workspaces.packages: ["apps/*", "packages/**", "tooling/*"]` | Must resolve to the **same 20 importers**. `packages/**` is the one to check: `packages/sdks/*` are members only if bun expands `**` the way pnpm does. If it does not, write the globs out (`packages/*`, `packages/sdks/*`) rather than dropping a member. The check is `bun pm ls` against the 20 keys of `p13-lock-snapshot.json` |
| `patchedDependencies: { nuqs }` | 7–8 | **deleted** | ADR-014 decision 17. `patches/` and the lock's `patchedDependencies` hash go with it. `bun patch` exists and we deliberately do not use it |
| `allowUnusedPatches: true` | 10–17 | **deleted** | Its cause dies with the patch: it existed only because the api image installed a workspace subset in which `nuqs` was absent |
| `verifyDepsBeforeRun: false` | 19–38 | **no bun analogue — dropped** | ADR-014 *Tradeoffs*: this is a pnpm-11 behaviour toggle, not a setting to port. Its cause — `apps/start/Dockerfile` installing ~10 of its 18 importers and then `COPY packages` — **remains**. Whether bun re-resolves in that situation is an empirical question, and `tooling/gates/p13-ssr.sh` is the thing that answers it |
| `overrides:` (6 entries) | 40–72 | `overrides` in the root `package.json` | Five translate one-for-one; one cannot be expressed — see §1.1 |
| `catalog:` (10 entries) | 75–85 | `workspaces.catalog` | All ten are now exact (M13-001), so the catalog is a version map, not a range map. Importers keep writing `catalog:` |
| `allowBuilds:` (12 entries, **all `false`**) | 87–117 | **`trustedDependencies` omitted entirely** | ADR-014 amendment 2. Writing the twelve names in would *invert* the policy. See §2, which is where the real work is |

`workspaces` must therefore be the **object** form, because the array form has
nowhere to put the catalog:

```jsonc
"workspaces": {
  "packages": ["apps/*", "packages/**", "tooling/*"],
  "catalog": {
    "zod": "4.3.6",
    "react": "19.2.3",
    "@types/react": "19.2.7",
    "react-dom": "19.2.3",
    "@types/react-dom": "19.2.3",
    "@types/node": "24.10.1",
    "typescript": "5.9.3",
    "pino": "10.3.1",
    "pino-pretty": "13.1.3",
    "@hyperdx/node-opentelemetry": "0.10.3"
  }
},
"overrides": {
  "rolldown": "1.0.0-beta.43",
  "esm-env": "npm:esm-env-runtime@^0.1.0",
  "seroval": "1.3.2",
  "seroval-plugins": "1.3.2",
  "embla-carousel": "8.0.0-rc22"
}
```

### 1.1 The one row bun cannot express: `"@nuxt/vite-builder>seroval": 1.4.0`

pnpm's `parent>child` override syntax scopes an override to one parent. **Bun's
`overrides` has no such form** — an override key is a package name, full stop.
So the exemption that keeps `@nuxt/vite-builder` on `seroval@1.4.0` while the
dashboard graph stays on `1.3.2` has no direct translation.

**Recorded as moot, to be re-proven, not assumed.** In the operator's
2026-09-07 survey the Nuxt SDK built under the **global `seroval: 1.3.2` pin**,
with no per-parent exemption. That is consistent with what
`pnpm-workspace.yaml:60-64` itself says about the row: `@nuxt/vite-builder`
"only imports `serialize`, which exists in both, so 1.3.2 would very likely
work" — the exemption was written so a *future* nuxt bump needing a real 1.4
API would fail loudly in the Nuxt SDK build rather than be silently held back.

So the recipe is: **drop the row, keep the global `seroval`/`seroval-plugins`
1.3.2 pins, and let the Nuxt SDK build be the proof.** The moment
`packages/sdks/nuxt` fails to build, the row was not moot after all and — per
the stop rule — that is an unreproducible pin, not an invitation to bump nuxt.

The two seroval pins themselves are the highest-stakes rows in the whole file:
they are what stands between the dashboard and `r.createEffectfulFunction is
not a function` on every SSR route. `tooling/gates/p13-ssr.sh` exists for them.

---

## 2. Lifecycle scripts: what pnpm actually ran, and what bun would

### The evidence

**pnpm runs no dependency build script at all.** `allowBuilds` is twelve
entries and every one is `false`. Measured on this box on 2026-09-07: a
`pnpm install` on this tree printed exactly two lifecycle scripts, and both are
**workspace-own** `postinstall`s, not dependency ones:

```
apps/testbed postinstall$ node scripts/copy-op1.mjs
apps/public  postinstall$ fumadocs-mdx
```

**Bun's default is not "run nothing".** Bun ships a built-in trusted list, and
it is large. Measured on this box on 2026-09-07 with `bun pm default-trusted`
(Bun 1.4.0): **367 packages**, of which **8 of the 12 `allowBuilds: false`
entries are on it** —

| on bun's default-trusted list | not on it |
|---|---|
| `@prisma/client`, `@prisma/engines`, `prisma`, `esbuild`, `msgpackr-extract`, `sharp`, `simple-git-hooks`, `workerd` | `@biomejs/biome`, `@parcel/watcher`, `@tailwindcss/oxide`, `protobufjs` |

A bare `bun install` therefore runs install scripts for eight packages whose
scripts have **never run** in any image this repo has ever shipped. That is
precisely the inversion ADR-014 amendment 2 forbids, and the repo already has
the scar: flipping `allowBuilds` to `true` during the pnpm 11 bump made
`sharp`'s install script attempt a node-gyp compile under
`npm_config_build_from_source=true` and broke the dashboard build
(`pnpm-workspace.yaml:98-103`, reverted in `4e715348`).

**And one of the eight fails outright.** In the operator's 2026-09-07 survey,
`simple-git-hooks`'s `postinstall` — which assumes a hoisted layout and walks
up to find `.git` — crashed under `bun install --linker=isolated`, the layout
ADR-014 amendment 1 makes the default attempt.

### The policy M13-002 uses

**`--ignore-scripts` on every install command**, not a `trustedDependencies`
array.

- It reproduces pnpm's *actual behaviour* (nothing ran) rather than a
  hand-maintained approximation of it.
- `trustedDependencies` is an allow-list layered on top of a 367-entry default;
  omitting it does **not** get you "nothing", it gets you those 367. The only
  formulation whose meaning does not depend on what a future bun release adds
  to its default list is the flag.
- It is one word per install command, greppable, and identical in the
  Dockerfiles, in CI and on a laptop — which is what makes "did a script run?"
  answerable from the command line rather than from a list.
- ADR-014 amendment 2 already says the field is omitted entirely. This is the
  same ruling stated as a positive: omit the field **and** pass the flag.

**The two workspace-own `postinstall`s must still run**, because they are build
steps the tree depends on (`apps/public`'s `fumadocs-mdx` generates the MDX
index; `apps/testbed`'s copies `op1.js` into `public/`). `--ignore-scripts`
suppresses them too, so every install site gains an explicit follow-up:

```bash
bun install --linker=isolated --frozen-lockfile --ignore-scripts
bun run --filter public   postinstall
bun run --filter testbed  postinstall
```

Naming them is a feature: it makes the set of scripts this repo runs a list in
one file rather than a property of a resolver's defaults.

> **Superseded in part by M13-002.** The policy is right; the *home* is not the
> command line. The gates and `verification/full.sh` run a bare
> `bun install --frozen-lockfile` with no flags of ours, so the flag would be
> off exactly where it matters. Both settings live in the root `bunfig.toml`
> instead (`[install] ignoreScripts = true` and `linker = "isolated"`), which
> makes every install command — flagged or bare — obey them. The two
> workspace-own `postinstall`s are now invoked by the scripts that need their
> output, and `bun run postinstall:workspaces` runs both explicitly. See
> *Lifecycle scripts: `bunfig.toml`, not a flag* below.

---

## 3. Every `package.json` script that shells out to `pnpm`

Measured 2026-09-07: **25 scripts across 5 manifests** — root, `apps/api`,
`apps/start`, `packages/core`, `packages/db`. Verified on Bun 1.4.0 on this
box: `bun run <script> <args…>` forwards trailing arguments to the script body
exactly as `pnpm <script> <args…>` does, so every `pnpm with-env X` becomes
`bun run with-env X` with no change to `with-env` itself; and `bun run` takes
`-F, --filter=<pattern>` — "Run a script in all workspace packages matching the
pattern" — which is what replaces `pnpm -r --filter`.

### `package.json` (root)

| script | today | bun |
|---|---|---|
| `test` | `pnpm --filter @openpanel/core run test && pnpm --filter @openpanel/db run test && pnpm --filter @openpanel/api run test && pnpm --filter start run test && vitest run` | `bun run --filter @openpanel/core test && bun run --filter @openpanel/db test && bun run --filter @openpanel/api test && bun run --filter start test && vitest run` |
| `gen:bots` | `pnpm -r --filter core gen:bots` | `bun run --filter core gen:bots` |
| `gen:referrers` | `pnpm -r --filter core gen:referrers` | `bun run --filter core gen:referrers` |
| `db:codegen` | `pnpm -r --filter db run codegen` | `bun run --filter db codegen` |
| `codegen` | `pnpm -r --filter db --filter core run codegen` | `bun run --filter db codegen && bun run --filter core codegen` — bun takes one `--filter` pattern per run; keep the **db-then-core order**, core's codegen reads db's generated client |
| `migrate` | `pnpm -r --filter db run migrate` | `bun run --filter db migrate` |
| `migrate:deploy` | `pnpm -r --filter db run migrate:deploy` | `bun run --filter db migrate:deploy` |
| `dev` | `pnpm --filter api run testing & pnpm --filter start run dev & wait` | `bun run --filter api testing & bun run --filter start dev & wait` |
| `dev:public` | `pnpm -r --filter public dev` | `bun run --filter public dev` |
| `typecheck` | `pnpm -r --no-bail typecheck` | `bun run --filter '*' typecheck` — **behaviour gap:** `--no-bail` makes pnpm typecheck every workspace and report all failures. Bun has no `--no-bail`. If it stops at the first failure, the script must keep going by construction (a loop over the workspace list, collecting exit codes) or the gate silently narrows to "the first package that fails" |
| `check:workspace` | `pnpm dlx sherif@latest` | `bunx sherif@<pinned>` — pin it while touching it (ADR-014 benchmark item 13; it is unpinned today) |
| `check:deps` | `NODE_PATH=$PWD/node_modules pnpm dlx --package dependency-cruiser@18.2.0 depcruise …` | ~~`bunx --package dependency-cruiser@18.2.0 depcruise …`~~ — **the one row this translation gets wrong.** `bunx` cannot give dependency-cruiser TypeScript, so every `import type` edge stops being `type-only` and the gate returns 82 false errors. M13-002 replaced it with `bun tooling/scripts/check-deps.ts`; see *`check:deps` is the one script that is not a `bunx`* below |
| `check` | `ultracite check && pnpm run check:deps` | `ultracite check && bun run check:deps` |

### `apps/api/package.json`

| script | today | bun |
|---|---|---|
| `testing` | `API_PORT=3333 pnpm dev` | `API_PORT=3333 bun run dev` |

### `apps/start/package.json`

| script | today | bun |
|---|---|---|
| `dev` | `pnpm with-env vite dev --port 3000` | `bun run with-env vite dev --port 3000` |
| `build` | `pnpm with-env vite build` | `bun run with-env vite build` |
| `start_deprecated` | `pnpm with-env node .output/server/index.mjs` | `bun run with-env node .output/server/index.mjs` |
| `deploy` | `pnpm build && npx wrangler deploy` | `bun run build && bunx wrangler deploy` |

`apps/start`'s `build` is the one the SSR gate drives, so it is the one that
must be right first.

### `packages/core/package.json`

| script | today | bun |
|---|---|---|
| `migrate:deploy:code` | `pnpm with-env jiti ./src/code-migrations/migrate.ts` | `bun run with-env bun ./src/code-migrations/migrate.ts` — ADR-019 row 7b already replaces `jiti` with bun as the TS runner |

### `packages/db/package.json`

| script | today | bun |
|---|---|---|
| `codegen` | `pnpm with-env prisma generate && jiti prisma/prisma-json-types.ts` | `bun run with-env prisma generate && bun prisma/prisma-json-types.ts` |
| `migrate` | `pnpm with-env prisma migrate dev` | `bun run with-env prisma migrate dev` |
| `migrate:deploy:db` | `pnpm with-env prisma migrate deploy` | `bun run with-env prisma migrate deploy` |
| `migrate:deploy:code` | `pnpm --filter @openpanel/core run migrate:deploy:code` | `bun run --filter @openpanel/core migrate:deploy:code` |
| `migrate:deploy` | `pnpm migrate:deploy:db && pnpm migrate:deploy:code` | `bun run migrate:deploy:db && bun run migrate:deploy:code` |
| `duplicate-events` | `pnpm with-env jiti ./scripts/find-duplicate-events.ts` | `bun run with-env bun ./scripts/find-duplicate-events.ts` |

**Out of this file's scope but in the same release** (ADR-014 *Migration
impact*): the shipped self-hosting templates —
`self-hosting/docker-compose.template.yml`, `self-hosting/coolify.yml` and
`.github/smoke/docker-compose.yml` — invoke `pnpm` **inside the api image** at
container start. They must change in the same release as the image, or
self-hosters' containers fail at boot.

---

## 4. The SSR gate procedure

`tooling/gates/p13-ssr.sh`. It is **green under pnpm today** — that is the
baseline the swap is measured against — and M13-002 runs it **unchanged**. The
only installer-specific thing in it is which binary runs the workspace's own
`build` script, detected the way `verification/full.sh` detects it: a committed
`bun.lock` means bun installed the tree.

```bash
bash tooling/gates/p13-ssr.sh
```

What it does, in `apps/start/Dockerfile`'s order:

1. **Builds** `apps/start` with `NITRO=1 SELF_HOSTED=1` through the package's
   own `build` script (which goes through `with-env`, i.e. the repo `.env`).
2. **Reproduces the runner stage's `esm-env` shim** and its
   `BROWSER=false / NODE=true / DEV=false` assertion. The standalone Nitro
   output ships `esm-env-runtime` under the `esm-env` override, so `esm-env`
   has to be made resolvable inside the SSR bundle; without it,
   `@number-flow/react` is a hard `ERR_MODULE_NOT_FOUND` at first render. This
   is the `overrides` row whose failure mode is invisible until a page renders.
3. **Boots `apps/api` (`ROLE=api`) and then `.output/server/index.mjs`**, each
   on a free port, with the `app_env` block from
   `.github/smoke/docker-compose.yml` pointed at this box's already-running
   services and at the api it just started. Databases are the **isolated
   `openpanel_test` Postgres and ClickHouse**, never the prod-copy `openpanel`
   ones; both asserted routes read no analytics, so the cost is one session
   lookup.
4. **Asserts exactly what `.github/smoke/smoke.sh`'s `assert_ssr_route`
   asserts** — HTTP 200, an `<html` in the body, at least 1000 bytes — for
   **`/login`** and **`/onboarding`**.
5. **Greps the dashboard log** for
   `is not a function|Cannot find (module|package)|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED`
   and fails on any hit — `assert_no_server_errors`, so an SSR failure
   swallowed into a 200 still shows up.

It always kills the two servers it started, on success, on failure and on an
interrupt. Logs land in `/tmp/openpanel-p13-ssr/` (`P13_SSR_RUN_DIR` to move
them).

**Why `/onboarding` is the second route.** ADR-014's gate wants "`/login` plus
one dashboard route", and every route past `/login` needs a session the smoke
stack has never seeded. `/onboarding` is the create-an-account page and renders
**without** a session by construction: its `beforeLoad` redirects only when a
session *exists*, and its loader is a no-op unless an `inviteId` search param is
present, so an anonymous request needs no seeded row. It also sits under the
`_public` layout rather than `/login`'s `_login` one, so the two assertions
cover two different server-rendered subtrees instead of the same layout twice.

**Run it with `tooling/gates/p13-drift.sh --assert`**, not instead of it. The
drift gate answers "did anything move?" and the SSR gate answers "does it still
work?" — main-8e60 was green on the second question's cheaper cousin (the
build) and red on the real one.

---

## Known drift hazards

**The installer swap is not an upgrade.** Everything in this section is what
happens when it is allowed to become one.

### What a bare `bun install` did to this tree

Operator survey, throwaway worktree, 2026-09-07 — **before** M13-001 pinned the
manifests, i.e. against the carets that were there:

| Workspace | direct deps | re-resolved to a **newer** version |
|---|---:|---:|
| `apps/start` | 165 | **86** |
| `packages/core` | 67 | **27** |
| `apps/public` | 43 | **9** |

Named examples: `prisma` 6.14 → **6.19**, `@clickhouse/client` 1.18 → **1.23**,
`nuqs` 2.5.2 → **2.10.1**. (The per-workspace direct-dependency counts are this
task's own measurement, from `tooling/gates/p13-lock-snapshot.json`.)

Two things then broke, both downstream of that re-resolve, neither of them in
the installer:

- **`apps/api` failed to boot**: `Export named 'Unsafe' not found` from
  `@sinclair/typebox@0.27.12` — a transitive of the Elysia stack that a
  different resolution paired with a copy expecting a different export surface.
- **`apps/public` failed to build**: `activeAnimations` missing from
  `motion-dom`, and `renderTranslation` missing from `fumadocs-core/i18n` — the
  same shape of failure, twice, in a workspace that is not even part of the
  backend rewrite.

Note what these have in common with the seroval incident
(`pnpm-workspace.yaml:19-37`): a resolver picked a *newer, in-range* version of
a package nobody edited, and the failure surfaced somewhere that looks like
application code. `prisma` 6.14 → 6.19 also crosses ADR-017 row 3
(**REFUSED** — 6.14.0 already carries both preview features) and ADR-012, which
pins `@prisma/adapter-pg` to `6.14.0` *because it matches the client exactly*.
A silent 6.19 breaks a decision, not just a build.

### The rule that follows

> **Drift is fixed by exact pins and `overrides` that cite the breakage — never
> by editing code to fit a newer dependency.**

Concretely, when M13-002 hits a version that moved:

1. **Pin it back**, using `tooling/gates/p13-lock-snapshot.json` as the source
   of truth for what it was. `tooling/gates/p13-drift.sh --assert` is the check.
2. If a **transitive** moved, add an `overrides` entry and **write the
   breakage into a comment next to it**, the way every row in
   `pnpm-workspace.yaml` does today. An override with no recorded symptom is
   the next person's mystery.
3. If neither works, **stop.** ADR-014's stop rule is not a last resort to be
   argued around — it is the decision. The repo stays on pnpm and the backend
   rewrite loses nothing, because Bun has run a pnpm-built `node_modules` since
   P3.

What is **never** the fix:

- changing application source so it compiles against a newer dependency (that
  is the upgrade the swap is not allowed to be, and it makes the swap
  unrevertible);
- bumping a declared range to "whatever bun picked" (ADR-017 rule 3: the
  lockfile swap must not carry a declared-range change in the same commit);
- relaxing a gate. `--linker=hoisted` instead of `isolated` is allowed *only*
  with a recorded reason and a re-run of the full gate (ADR-014 amendment 1),
  because a hoisted layout resolves phantom dependencies by accident and turns
  an install-time failure into a container-time one.

### Two smaller hazards worth naming

- **Workspace-vs-registry linking.** `apps/start` depends on
  `@openpanel/web@1.0.5` **from npm** while `packages/sdks/web` is
  `1.4.1-local`; `apps/public` likewise takes `@openpanel/nextjs@1.2.0` from
  npm. If bun's workspace-linking default differs from pnpm's, the dashboard
  silently starts running a different copy of its own tracking SDK. Both are in
  the snapshot at their registry versions, so `p13-drift.sh` sees the flip.
- **`bun install` re-resolving inside a Docker build stage.** This is the
  main-8e60 mechanism in a new costume: `apps/start/Dockerfile` installs a
  subset, then `COPY packages`, then builds. `--frozen-lockfile` on every
  install command is what makes that re-resolve an error instead of a silent
  rewrite — and it is the successor to `verifyDepsBeforeRun: false`, which has
  no bun analogue.

---

# M13-002 — the swap, as executed

Everything below was executed on this box on **2026-09-07**, by the M13-002
implement task, on Bun **1.4.0** and pnpm **11.23.0**. Every number is from a
run recorded here; nothing is carried over from the M13-001 survey.

The stop rule did **not** fire. Every gate ADR-014 names is green under the bun
tree, `verification/full.sh` included. One of them — the SDK dist gate — needed
a one-line controller fix first, for a reason worth knowing before you write any
script against this tree; see *pnpm can no longer run a script inside this tree*
below.

## What bun's `overrides` actually do — measured, not assumed

Four properties, each established by installing this tree and reading the
result. They are what the table in the next section is built on, and three of
them are counter-intuitive enough to be worth writing down.

1. **Overrides apply to `peerDependencies`.** Nine of the eleven initial drift
   rows were peers pnpm auto-installed and bun resolved differently; six were
   fixed by a plain `"<name>": "<version>"` override.
2. **A `name@spec` key matches when the *requested* range is a SUBSET of the
   key's range.** Key `prisma@^5.1.1` matched the two `^5.1.1` devDeps and left
   `packages/db`'s `prisma: 6.14.0` alone. Key `next@^12.0.0` did **not** match
   a request of `^12.0.0 || … || ^16.0.0` (the union is not a subset of
   `^12.0.0`), while a key spelled as that whole union **did** match a request
   of `16.0.7`. So the key must be a superset of the request; it is not an
   intersection test.
3. **Two keys that both match one request cancel — for the whole package
   name.** With `next@16.0.7` and `next@^12.0.0 || … || ^16.0.0` both present,
   *neither* applied to *either* importer. This is why §"the three exact pins"
   below could not be an override.
4. **A new override is only honoured on a fresh resolve.** Adding an override
   and re-running `bun install` against an existing `bun.lock` left already-
   locked peers at their old versions; `nuxt`, `expo-application` and
   `react-native` only moved after `rm bun.lock`. Anyone adding a row here must
   delete the lockfile, not amend it.

Two forms were tried and do **not** work on Bun 1.4.0: `overrides` declared in a
workspace member's own `package.json` (silently ignored — verified against
`packages/sdks/nextjs`), and yarn-style path keys in `resolutions`
(`"@openpanel/nextjs/next"` — silently ignored).

## Overrides

Every row, with the breakage it fixes. Rows 1–5 are carried over from
`pnpm-workspace.yaml`; rows 6–15 are new in M13-002 and each cites the failure
it was added for. The one pnpm row that is **not** here is
`"@nuxt/vite-builder>seroval": 1.4.0` — see §1.1 above; it is dropped because
bun cannot express a parent-scoped override, and it is proven moot by
`cd packages/sdks/nuxt && bun run build` succeeding under the global
`seroval: 1.3.2` pin (run 2026-09-07, `✔ Build succeeded for nuxt`, 4.14 kB).

| # | Override | Breakage it fixes |
|---|---|---|
| 1 | `rolldown: 1.0.0-beta.43` | Carried from pnpm. **Now inert** — no package in `bun.lock` requests `rolldown` (tsdown was deleted in M12). Kept because ADR-017 rules the register frozen: "the `rolldown` override … stays on purpose" |
| 2 | `esm-env: npm:esm-env-runtime@^0.1.0` | Carried. Resolves to `esm-env-runtime@0.1.1`. Without it `@number-flow/react`'s `import "esm-env"` is `ERR_MODULE_NOT_FOUND` at first SSR render. Proven by `p13-ssr.sh`'s in-bundle assertion (`BROWSER=false, NODE=true, DEV=false`) |
| 3 | `seroval: 1.3.2` | Carried. The dashboard pin. `bun.lock` contains exactly one `seroval@1.3.2` and one `seroval-plugins@1.3.2` — no 1.4.x anywhere. Proven by `p13-ssr.sh` (`/login` 152348 bytes, `/onboarding` 156301 bytes, dashboard log clean) |
| 4 | `seroval-plugins: 1.3.2` | Carried, same failure as row 3 |
| 5 | `embla-carousel: 8.0.0-rc22` | Carried. `AutoplayType` vs `CreatePluginType`; the failure mode is `apps/start` failing to typecheck. Proven by `start` PASS in `bun run typecheck` |
| 6 | `express: 4.19.2` | `packages/sdks/express`'s peer `express: ^4.17.0 \|\| ^5.0.0` resolved to **5.2.1**; the snapshot has 4.19.2. Drift row |
| 7 | `prisma@^5.1.1: 5.9.1` | The two ADR-017 rule 2 carve-out devDeps (`packages/redis`, `packages/sdks/_info`) resolved to **5.22.0**; the snapshot has 5.9.1. Spec-scoped so `packages/db`'s `prisma: 6.14.0` is untouched — the declared `^5.1.1` ranges are **not** edited, which is what rule 2 forbids |
| 8 | `h3: 1.15.4` | `packages/sdks/nuxt`'s peer `h3: ^1.0.0` resolved to **1.15.11**. Drift row |
| 9 | `nuxt: 4.2.2` | `packages/sdks/nuxt`'s peer `nuxt: ^3.0.0 \|\| ^4.0.0` resolved to **4.5.2**. Drift row |
| 10 | `react-native: 0.73.6` | `packages/sdks/react-native`'s peer `react-native: *` resolved to **0.87.1**. Drift row |
| 11 | `expo-application: 5.3.1` | Same package's peer `5 - 7` resolved to **7.0.8**. Drift row |
| 12 | `expo-constants: 15.4.5` | Same package's peer `14 - 18` resolved to **18.0.14**. Drift row |
| 13 | `framer-motion@^12.40.0: 12.40.0` | With `motion`'s `framer-motion: ^12.40.0` free, bun took **12.43.0**, which requests `motion-dom: ^12.43.0` and drags row 14's single copy forward. pnpm resolved this edge to 12.40.0 |
| 14 | `motion-dom@^12.23.23: 12.40.0` | **`cd apps/public && bun run build` failed**: `Attempted import error: 'activeAnimations' is not exported from 'motion-dom'`, from `framer-motion@12.23.25/dist/es/projection/node/create-projection-node.mjs`, traced through `HTMLProjectionNode.mjs` → `use-instant-layout-transition.mjs` → `src/components/navbar.tsx`; `Build failed because of webpack errors`. pnpm carried four `motion-dom` copies (11.18.1 / 12.23.23 / 12.38.0 / 12.40.0); bun collapses the whole 12.x line onto one, and it chose 12.43.0. Measured on this box: `activeAnimations` is exported by 12.23.23, 12.38.0 and 12.40.0 and **absent** in 12.43.0, so 12.40.0 is the one version that satisfies every 12.x requester here. Subset matching (property 2) makes the single `^12.23.23` key cover `^12.38.0` and `^12.40.0` too |
| 15 | `lucide-react@^1.7.0: 0.555.0` | **`apps/public` failed to typecheck** with a ~40-line `fumadocs-core` structural mismatch ending in `Types have separate declarations of a private property 'flattenPathToFullPath'`, between `fumadocs-core@16.7.11+3b8a98ceba1412f0` and `fumadocs-core@16.7.11+18a2f888045eb88b`. Same version, two peer-hashed copies, differing in exactly one entry: which `lucide-react` filled `fumadocs-core`'s **optional** peer `lucide-react: "*"` — `0.555.0` (apps/public's own pin) for apps/public + `fumadocs-mdx`, `1.42.0` for `fumadocs-ui` + `fumadocs-openapi`. pnpm resolved that optional peer to 0.555.0 for *every* consumer and produced ONE `fumadocs-core`; bun resolves it per scope. Forcing the `^1.7.0` requesters onto the same 0.555.0 collapses the two instances. **Residual risk, stated:** `fumadocs-ui`/`fumadocs-openapi` now run a lucide-react a major below what they declare. The webpack build is the check — it reports every unresolved named import (that is how row 14 was found) and reported none for lucide-react across 242 generated pages |
| 16 | `vue: 3.5.25` | **`packages/sdks/nuxt` failed to typecheck**: `src/runtime/plugin.client.ts(11,16): error TS2664: Invalid module name in augmentation, module '@vue/runtime-core' cannot be found.` `nuxt@4.2.2` resolved `vue` to **3.5.42** under bun (pnpm: 3.5.25), which put `@vue/runtime-core@3.5.42` in the tree beside the `3.5.25` the package declares as a devDep, and the augmentation resolved to neither. Pinning `vue` back to pnpm's 3.5.25 leaves exactly one `@vue/runtime-core` |

## The three exact pins, and why they are not overrides

`packages/sdks/nextjs` gains three **devDependencies** at exact versions:

```jsonc
"next": "15.0.3", "react": "19.1.1", "react-dom": "19.1.1"
```

Its `peerDependencies` are **not** touched — the published contract is byte
identical. These three are the versions pnpm's `auto-install-peers` put in
`packages/sdks/nextjs/node_modules`, and they are already recorded as such in
`tooling/gates/p13-lock-snapshot.json`. Bun instead deduped them onto
`apps/public`'s `next: 16.0.7` and the catalog's `react`/`react-dom: 19.2.3`.

An override cannot express this. The only `name@spec` key that matches the
peer's request (`^12.0.0 || ^13.0.0 || ^14.0.0 || ^15.0.0 || ^16.0.0`) is a
superset of it, and every such superset also matches `apps/public`'s `16.0.7`
(property 2) — measured: the union key moved `apps/public` to 15.0.3 and
`apps/testbed` to react 19.1.1, trading three drift rows for three others.
Adding a second, narrower key to exempt them cancels both (property 3). A
workspace-level `overrides` block and a yarn path key are both ignored.

So the mechanism is the other one the task allows: an **exact pin**, declaring
in the manifest what pnpm did implicitly. It is the smallest change that makes
`p13-drift.sh --assert` exit 0, and it is worth flagging to a reviewer as the
one row in this swap that adds declarations rather than constraining
resolution.

## `packageManager` is removed, not repointed to bun

The field is **deleted** from the root `package.json` rather than rewritten to
`bun@1.4.0`.

`packageManager` is corepack's field, and corepack shims npm/pnpm/yarn — it has
never installed or dispatched bun. Leaving `pnpm@11.23.0` there after the swap
would be a lie a `corepack enable` would act on; writing `bun@1.4.0` would name
a value nothing on this box reads, and ADR-016 rule 5 is explicit that *"an
unasserted exact pin is worse than a range, because it reads as a guarantee and
is not one"*. Bun's version pin already has a home a build actually reads —
`apps/api/Dockerfile:4`'s `ARG BUN_VERSION=1.4.0`, feeding
`oven/bun:${BUN_VERSION}-slim` — so a second copy in `package.json` would add a
drift site and no enforcement. (ADR-016 also names a `.bun-version` file; that
file does not exist in this tree. Creating it is outside M13-002's scope —
recorded in `docs/TECH_DEBT.md`.)

`bunx sherif@1.13.0` (`check:workspace`) notices: its `root-package-manager-field`
rule wants the field present. That is the only row the deletion adds — sherif
goes from **25 issues (19 errors)** at `HEAD` to **26 (20)** here, both measured
on 2026-09-07 with the same pinned sherif. The other 19 are pre-existing
declared-range facts ADR-017 freezes, so this script was already red and is not
a gate anything passes today.

## `check:deps` is the one script that is not a `bunx`

`pnpm dlx X` -> `bunx X` is right everywhere except here, and it is worth
knowing why before someone "simplifies" it back.

dependency-cruiser only tags an edge `type-only` when it can load the
TypeScript compiler, and `type-only` is exactly what
`.dependency-cruiser.cjs`'s `core-uses-ctx-not-db-internals` exempts
(`dependencyTypesNot: ['type-only']`). It resolves `typescript` — its own
*optional peer* — from its own directory, an ESM lookup that `NODE_PATH` cannot
influence at all. `pnpm dlx` satisfied that by accident: pnpm auto-installs
optional peers, so the dlx sandbox contained TypeScript next to the cruiser.

Measured on this box on 2026-09-07, same tree, same config, `depcruise --info`
plus the full cruise over `apps/start packages`:

| runner | `typescript` found | result |
|---|---|---|
| `pnpm dlx --package dependency-cruiser@18.2.0` | `typescript@5.9.3` | `no dependency violations found (2703 modules, 18121 dependencies)` |
| `bunx --package dependency-cruiser@18.2.0` | `-` | **82 errors** (2695 modules, 17845 dependencies) |
| `npx --yes --package dependency-cruiser@18.2.0` | `-` | 82 errors |
| `npx --yes -p dependency-cruiser@18.2.0 -p typescript@5.9.3` | `-` | 82 errors |

All 82 are `import type` lines the rule allows. The failure is silent and it is
the wrong direction — a gate that goes red on correct code. It is also **not**
caused by the installer: `bunx` produces the same 82 on a pnpm-installed tree
(verified by restoring `HEAD` and re-running).

So `check:deps` is `bun tooling/scripts/check-deps.ts`, which installs
`dependency-cruiser@18.2.0` and `typescript@5.9.3` **together, hoisted**, into
`node_modules/.cache/depcruise` and runs the tool from there. Both versions are
exact — this gate's answer must not move because a patch release shipped. It
reproduces `pnpm dlx`'s numbers exactly (`2703 modules, 18121 dependencies`,
zero violations) and the temp install is a no-op after the first run.

## Lifecycle scripts: `bunfig.toml`, not a flag

The recipe's §2 policy is `--ignore-scripts` on every install command. **That is
not sufficient**, because the gates and `verification/full.sh` run a *bare*
`bun install --frozen-lockfile` with no flags of ours. The policy therefore
lives in the root `bunfig.toml`:

```toml
[install]
ignoreScripts = true
linker = "isolated"
```

Both keys were verified to be honoured on Bun 1.4.0 before being relied on —
unknown keys in `bunfig.toml` are *silently ignored* (the same trap
`packages/core/bunfig.toml` records for `[test] isolate`), so "it is in the
file" is not evidence:

- `ignoreScripts`: a scratch package depending on `simple-git-hooks@2.12.1`
  (default-trusted) fails its postinstall under `--linker=isolated` with a bare
  `bun install`; with `[install] ignoreScripts = true` the same install exits 0
  and runs nothing. Identical to passing `--ignore-scripts`.
- `linker`: a scratch install with only `[install] linker = "isolated"` produced
  `node_modules/.bun/`, the isolated layout.

`trustedDependencies` is absent, per ADR-014 amendment 2. Note for the record
that `bun pm ls --trusted` is **not** empty on this tree — it prints
`simple-git-hooks@2.12.1`, because that package is on bun's 367-entry default
list. ADR-014's benchmark item 6 asked for that command to be empty; the
honest reading is that the list is not the enforcement point and never was.
`ignoreScripts` is, and the observable fact it asked for — no dependency build
script runs — holds: a full install prints no lifecycle script output, and
`sharp`, `prisma`, `esbuild`, `msgpackr-extract` and `workerd` are all
installed with their install scripts unrun, exactly as under pnpm.

The two **workspace-own** postinstalls that pnpm did run (`apps/public`'s
`fumadocs-mdx`, `apps/testbed`'s `node scripts/copy-op1.mjs`) are suppressed by
the same setting, and both generate gitignored build inputs. Each is now
invoked by the script that needs its output (`apps/public`'s `build` /
`preview` / `deploy`, which already did this in `typecheck`; `apps/testbed`'s
`build` / `dev`), so a package is buildable straight after an install with no
follow-up step to remember. `bun run postinstall:workspaces` runs both
explicitly for anyone who wants the pnpm-era behaviour back.

## `jiti` is gone from every script (ADR-019 row 7b)

`apps/api` invoked `jiti` in three scripts and **never declared it** — pnpm's
layout happened to make the binary reachable. Under `--linker=isolated` it is
not: `bun run e2e:sessions` fails with `Error: spawn jiti ENOENT`. That is the
phantom dependency the isolated layout exists to surface, and ADR-019 row 7b
(**ADOPT**, P12) already rules the fix: `jiti X.ts` → `bun X.ts`. Applied to
`apps/api`'s `test:manage` / `e2e:sessions` / `e2e:sessions:stress` and to
`tooling/publish`'s `publish`, alongside the `packages/db` and `packages/core`
entries the recipe's §3 table already listed.

The `jiti` **devDependency** in `packages/core` and `packages/db` stays
declared. Deleting it is ADR-017 rule 2's separate CLEAN task, and removing it
here would make `p13-drift.sh` report it `missing`.

## `typecheck` and the missing `--no-bail`

`pnpm -r --no-bail typecheck` had no bun equivalent (recipe §3 flagged it).
Root `typecheck` is now `bun tooling/scripts/typecheck-workspaces.ts`, which
expands the same three workspace globs, runs every package that declares a
`typecheck` script (17 of them) at CPU-count concurrency, prints each result,
and exits 1 listing every failure — the "keep going by construction" the recipe
asked for.

## pnpm can no longer run a script inside this tree — and one gate needed that

Recorded because it cost two blocked attempts and it will surprise the next
person: after this swap, **any** invocation of `pnpm run <script>` inside this
repo fails before it does any work. pnpm 11 verifies `node_modules` against the
workspace before running a script and re-installs on mismatch — that is what
`pnpm-workspace.yaml`'s `verifyDepsBeforeRun: false` suppressed, and that file
is deleted. The implicit install then dies on

```
[ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC] No catalog entry '@types/node' was found for catalog 'default'
```

because `catalog:` now resolves from the root `package.json`'s `workspaces.catalog`,
which pnpm does not read.

`verification/contracts/sdk/dist-gate.sh` shelled out to a hardcoded
`pnpm run build` and was the sole failing item in `verification/full.sh` for
exactly this reason. It is a **controller** file — out of this task's scope —
and the operator has since given it the same `bun.lock` detection
`full.sh:12-19` carries. Both now pass on this tree:

```
verification/contracts/sdk/dist-gate.sh   → DIST GATE: all 5 checked package(s) clean   (rc=0, 2026-09-07)
verification/full.sh                      → FULL: green                                  (rc=0, 2026-09-07)
```

Three repo-side workarounds were tried during the blocked attempts and all
three are dead ends; they are listed so nobody re-spends them:

| attempt | result |
|---|---|
| `.npmrc` (`verify-deps-before-run=false`, via `NPM_CONFIG_USERCONFIG`) | ignored — the implicit `pnpm install` still fired |
| env var `npm_config_verify_deps_before_run=false` | ignored — `pnpm config get verify-deps-before-run` prints `undefined` |
| a per-SDK `pnpm-workspace.yaml` in each package directory | works, and is rejected: it re-introduces pnpm config to a repo that just removed it, to satisfy a stale line in a protected script |

The rule that generalises: a script that wants to build or run something in
this tree invokes `bun`, not `pnpm`. Every caller inside the repo now does. The
three Dockerfiles still name `pnpm-lock.yaml` (M13-003) and CI still installs
pnpm (M13-004); both fail this way until they are converted.
