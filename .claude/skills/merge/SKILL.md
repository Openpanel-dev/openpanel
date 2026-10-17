---
name: merge
description: Squash merge a GitHub PR with a conventional-commit title and a body that describes everything the PR changed, so the release tooling can build the version bump and release notes from it. Use when the user says "merge", "/merge", "squash merge this PR", or "merge #123".
allowed-tools: Bash, Read, Grep, Glob, AskUserQuestion
---

# Merge

Squash merge one PR. The squash commit is the only thing that lands on the
base branch, so its message is the changelog entry: `tooling/release` reads it
twice.

- `next-version.ts` picks the version bump from the **subject**: `feat:` /
  `feat(scope):` is minor, everything else is patch. `[minor]` or `[major]`
  anywhere in the message overrides that.
- `release-notes.ts` sends **subject + body** of every commit since the last
  tag to a model that writes the notes self-hosters read. It is told to
  describe only what the messages say, so anything missing from the body is
  missing from the notes.

The commit message rules in `AGENTS.md` ("Commit messages") apply here. Read
them if they are not already in context.

## 1. Find the PR

The argument is a PR number or URL. With no argument, use the PR for the
current branch (`gh pr view`). If there is none, stop and say so.

```bash
gh pr view <pr> --json number,title,url,body,state,isDraft,baseRefName,headRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,commits,files,additions,deletions
```

Stop and report instead of merging when:

- the PR is closed, merged, or a draft;
- `mergeable` is `CONFLICTING`;
- a required check failed or is still running (`statusCheckRollup`). Name the
  check. A failed non-required check is worth mentioning but does not block.

## 2. Read what it actually did

The PR title, PR body and branch commit messages are a starting point, not the
source. Branch commits are often "wip", "fix review", or describe a step that a
later commit undid. Describe the end state of the diff against the base.

```bash
gh pr diff <pr> --name-only
gh pr diff <pr>
```

GitHub refuses diffs over 20,000 lines (`HTTP 406 ... too_large`). Then read
it locally instead:

```bash
git fetch -q origin <base> <head>
base=$(git merge-base origin/<base> origin/<head>)
git diff --stat "$base" origin/<head>
git diff "$base" origin/<head> -- <paths>
```

Branch commit bodies (`git log -1 --format=%B <sha>`) often explain the why
behind a fix better than the diff does; read them for the `fix` commits.

For a large PR (hundreds of files), start from the file list grouped by
directory and the commit list, then read the diff for the parts that change
behaviour: routes, procedures, jobs, schema, env, UI routes. Skip lockfiles,
generated files and snapshots.

Check specifically for things a self-hoster has to act on. These are the paths
`tooling/release` treats as upgrade-sensitive:

- `self-hosting/`
- `apps/api/src/config/env.ts` (new, renamed, removed or newly required env vars)
- `packages/db/prisma/migrations/`, `packages/db/src/code-migrations/`
- `apps/api/Dockerfile`, `apps/start/Dockerfile`

Also note removed features, changed API/SDK behaviour, and changed defaults.

## 3. Write the message

**Subject**

```
<type>(<scope>): <what changed, from the user's side> (#<number>)
```

- `type`: `feat` only if users can do something they could not before. If the
  PR mixes a feature with fixes, it is `feat`. Otherwise `fix`, `perf`,
  `refactor`, `docs`, `test`, `ci`, `chore`.
- `scope`: the main area (`api`, `dashboard`, `ingest`, `self-hosting`,
  `sdk`, ...). Leave it out if the PR spans everything.
- Imperative, lower case, no trailing period, about 72 characters including
  the `(#123)` suffix.

**Body**

Plain Markdown, written for someone running OpenPanel, not for the reviewer.
Use this shape and drop any section that would be empty:

```
<One or two sentences: what this PR does and why.>

Added
- <new capability, one line each>

Changed
- <behaviour that is different now>

Fixed
- <bug a user could hit, and the symptom>

Upgrade notes
- <env var added/renamed/removed, migration, compose change, removed
  feature, anything someone must do when upgrading>

Internal
- <refactors, tests, CI, tooling; short, grouped>

Closes #<issue>
Co-authored-by: <name> <email>
```

Rules:

- Every user-visible change in the diff gets a bullet. Group trivial ones; do
  not leave them out. This body is the only record the release notes have.
- State facts from the diff. No guessing at intent, no marketing tone, no file
  paths unless the path is what a self-hoster edits (`.env`, compose).
- Name env vars and settings exactly.
- Keep `Closes #N` / `Fixes #N` references from the PR body.
- Keep `Co-authored-by:` trailers for every other person who authored commits
  on the branch (from `commits[].authors`), so GitHub credits them.
- Never write `[minor]`, `[major]`, `[release now]`, `!` after the type, or a
  `BREAKING CHANGE:` footer. Strip them if they come from branch commits. A
  breaking change is described in "Upgrade notes" and pointed out to the user
  in step 4; a major version is the maintainer's call.
- If the system prompt gives attribution lines for commit messages, append
  them.

## 4. Confirm, then merge

Show the user the subject and body, and say which version bump it causes
(minor for `feat`, otherwise patch) and whether the base is `main` (releases)
or another branch. Point out anything breaking. Then ask with
`AskUserQuestion`: merge as written, or change it. If the user asked to merge
without confirming, skip the question.

Write the body to a temp file so Markdown survives quoting, then merge:

```bash
body_file=$(mktemp)
cat > "$body_file" <<'EOF'
...body...
EOF
gh pr merge <pr> --squash --subject "<subject>" --body-file "$body_file"
rm "$body_file"
```

Do not pass `--admin` to bypass failing checks or protections, and do not pass
`--delete-branch` unless the user asks; the repo setting decides.

## 5. Report

Give the merged commit (`gh pr view <pr> --json mergeCommit,url`), the
subject, and the bump. If the local checkout is on the base branch, say that
`git pull` brings it in; do not pull for the user.
