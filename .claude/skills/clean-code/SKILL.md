---
name: clean-code
description: Coding standards for this repo - concise, direct, no over-engineering, and no comments that carry no knowledge. Use when writing or reviewing any code here, and whenever adding a comment.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Clean code

Adapted from `davila7/claude-code-templates` (MIT). The comment rules below are
this repo's own, derived from what a 2026-09-28 cleanup actually found.

`AGENTS.md` and `packages/core/AGENTS.md` are the binding contract. Where this
file and either of those disagree, **they win.**

## Core principles

| Principle | Rule |
|---|---|
| **SRP** | One responsibility per function. But see the size note below. |
| **DRY** | At the narrowest level that fits — the module first. Never invent a cross-module abstraction for two call sites. |
| **KISS** | The simplest thing that works. |
| **YAGNI** | No abstraction, parameter or hook for a need that does not exist yet. |
| **Boy Scout** | Leave what you touch cleaner — inside the task's scope only. |

## Naming

| Element | Convention |
|---|---|
| Variables | Reveal intent: `userCount`, not `n`. No abbreviations unless universal. |
| Functions | Verb + noun: `getUserById()`, not `user()`. |
| Booleans | Question form: `isActive`, `hasPermission`, `canEdit`. |
| Constants | `SCREAMING_SNAKE`, at the top of the file or in the module's `<name>.constants.ts`. Never a magic number inline. |

**If you need a comment to explain a name, rename it.**

## Function size — read this before splitting anything

`packages/core/AGENTS.md` is explicit: *"a coherent 100-line function beats
twenty five-line fragments. Split where a reader benefits, not to satisfy a
metric."*

So: no line limit. Split when a reader benefits. Keep arguments few, prefer an
options object over four positionals, use guard clauses and early returns, and
avoid nesting past two levels.

## Comments — the part that actually goes wrong here

Comment the **why**, briefly: an invariant, a non-obvious side effect, a
constraint that bit someone, a reason the obvious spelling is wrong. Never
narrate what the code does.

These five shapes are banned. Each one was found in bulk in this repo and
deleted:

| Banned | Why | Instead |
|---|---|---|
| **Restating a rule from `AGENTS.md`** — `// Isomorphic by the AGENTS.md rule: zod and nothing else.` | True of every file of that name, machine-enforced by the `constants-stay-isomorphic` cruiser rule, and visible from the imports. Zero knowledge. | Nothing. Delete it. |
| **Citing a document the repo does not contain** — `// Cluster note (docs/ENVIRONMENT.md): …` | 479 `ADR-nnn` and ~90 doc links pointed into a checkout that never ships. An unresolvable citation reads as authority it cannot back. | State the fact itself, with no citation. |
| **Provenance** — `// Moved from packages/db/src/services/x.service.ts` | Says nothing about the file you have open, and rots the moment the path moves. | Nothing. `git log` knows. |
| **Referring to a system that no longer exists** — `// exactly as V1 does`, `// V1's twin` | Justifies current behaviour by a reference point the reader cannot check. | State the rule the code follows. |
| **Task ids** — `// M10-005:`, `// P11:` | Meaningless outside the tracker that issued them. | Nothing. |

A comment that survives those five says something a careful reader could not
have got from the code. That is the bar.

## Anti-patterns

| Don't | Do |
|---|---|
| Comment every line | Delete the obvious ones |
| Helper for a one-liner | Inline it |
| Factory for two objects | Construct them directly |
| A `utils.ts` holding one function | Put it where it is used |
| Deep nesting | Guard clauses |
| Magic numbers | Named constants |
| God functions | Split by responsibility, not by line count |
| `any` | `unknown`, then narrow |
| `as` assertions | Narrowing |
| `console.log` / `debugger` left behind | Remove before finishing |

## Before editing a file

| Ask | Because |
|---|---|
| What imports this? | They may break — `grep -rn "from '.*<name>'"` |
| What does it import? | An interface change ripples |
| What tests cover it? | Run them, not the whole suite |
| Is it on a package's public surface? | `packages/core/src/index.ts` and the `exports` map are contracts |

Edit the file and every dependent in the same change. Never leave a broken
import or a half-applied rename.

## Before saying it is done

Run what the change warrants, from `AGENTS.md`'s verification table — not the
whole suite for a one-line fix, and always the full one for a query or ingest
change:

```bash
bun run typecheck                      # always
npx ultracite fix <files you changed>  # always; they must come out clean
bun test --isolate                     # in packages/core, for backend changes
bunx vitest run                        # in apps/start, for dashboard changes
bun run check:deps                     # if you touched a package boundary
```

Report what you ran and what you saw. A screenshot or a query result is
evidence; "should work" is not.
