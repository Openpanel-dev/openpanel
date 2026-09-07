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
| `check:deps` | `NODE_PATH=$PWD/node_modules pnpm dlx --package dependency-cruiser@18.2.0 depcruise …` | `NODE_PATH=$PWD/node_modules bunx --package dependency-cruiser@18.2.0 depcruise …` |
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
