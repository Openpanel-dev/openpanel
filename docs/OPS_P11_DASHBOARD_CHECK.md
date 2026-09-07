# Dashboard human check-list — P11 dissolution (M11-009)

> This box has no browser. `curl http://127.0.0.1:4173/login` proves the SPA
> shell boots and serves HTML (the automated boot gate); it cannot prove a
> chart renders or a form validates. That half is this checklist — run it by
> hand against `bun run build && bun run preview` (or `bun run dev`) in a real
> browser after any change that touches `@openpanel/core`'s
> `*.constants.ts` files or `apps/start/src/utils/{math,slug,super-json,
> union-omit}.ts` — the P11 dissolution's actual runtime surface.

A pass is: no red error overlay, no blank panel where a chart should be, no
console error mentioning `validation`, `constants`, `common` or `json`
(the four deleted packages), and every listed control accepts valid input and
rejects invalid input with a visible message.

## 1. Sign-in (`/login`)

- [ ] Page renders the email/password form, no console errors.
- [ ] Submitting an empty form shows a validation message under each empty
      field (uses `zSignInEmail` from `auth.constants.ts`) — nothing is sent.
- [ ] Submitting a malformed email shows a validation message.
- [ ] Signing in with a valid seeded user redirects to `/<organizationId>`.

## 2. Organization overview (`/:organizationId`)

- [ ] The project list renders.
- [ ] Any per-project metric tiles render numbers, not `NaN` or blank
      (exercises `round`/`average`/`sum` from `apps/start/src/utils/math.ts`).

## 3. Project overview (`/:organizationId/:projectId`)

- [ ] The overview line chart renders a line, with an x-axis labelled by the
      selected interval (exercises `intervals`/`timeWindows` from
      `report.constants.ts`).
- [ ] Switching the time-window picker (e.g. 24h → 7d → 30d) redraws the
      chart and updates the interval shown on the x-axis.
- [ ] The weekly-trends / previous-period comparison tile shows a %
      change, not `NaN%` (exercises `getPreviousMetric`).

## 4. Report builder (`/:organizationId/:projectId/insights` → new report)

- [ ] Adding an event to the report opens the event picker and lists events.
- [ ] Adding a filter to an event opens the filter builder; the operator
      dropdown is populated (exercises `operators`/`getOperatorsForType`
      from `report.constants.ts`) and choosing an operator that needs a
      value (e.g. "is one of") requires one before the filter can be saved.
- [ ] Switching chart type (line / bar / pie / funnel) redraws without a
      crash for at least: line, bar, funnel.
- [ ] Changing the breakdown dimension redraws the chart with a new legend.
- [ ] Saving the report and reloading the page preserves the chart config.

## 5. Cohort builder (`/:organizationId/:projectId/cohorts` → new cohort)

- [ ] The event/property criteria builder renders and accepts at least one
      criterion (exercises `cohort.constants.ts`).
- [ ] Saving with zero criteria is rejected with a visible message.

## 6. Project settings → filters (`/:organizationId/:projectId/settings`)

- [ ] The IP/profile-id filter forms accept a value and show it in the list
      after saving (exercises `project.constants.ts`).

## 7. Notification rule (`/:organizationId/:projectId/notifications` → new rule)

- [ ] The rule-condition form renders and a rule can be saved with at least
      one condition (exercises `notification.constants.ts`).

## 8. Onboarding (`/onboarding` with a fresh org, or `/steps/onboarding/:projectId`)

- [ ] The project-creation step's type dropdown lists the project types
      (exercises `ProjectTypeNames` from `project.constants.ts`).

## What a fail looks like

- A blank panel where a chart should be, or a chart that never stops
  showing its loading state.
- A red React error overlay (dev) or a blank white page (prod build).
- A dropdown with zero options where the sections above say it should be
  populated.
- A form that submits despite an empty required field, or one that never
  accepts valid input.
- Any browser console error whose message names `@openpanel/validation`,
  `@openpanel/constants`, `@openpanel/common` or `@openpanel/json` — those
  four packages are deleted; such an error means a stray reference survived
  the codemod.
