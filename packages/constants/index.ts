export const RESERVED_EVENT_NAMES = ['session_start', 'session_end'] as const;

export type { EmailCategory } from '@openpanel/core/modules/email/email.constants';
// Moved into @openpanel/core's email module (M6-004, ADR-008's module map:
// email owns "C"). Re-exported here for existing @openpanel/constants
// importers (packages/trpc's email router, apps/start's unsubscribe +
// email-preferences pages) — same shape as `ProjectTypeNames`'s re-export
// since M6-002. Keys must match the template `category` in @openpanel/email.
export { emailCategories } from '@openpanel/core/modules/email/email.constants';
// Moved into @openpanel/core's project module (M6-002, ADR-008's module
// map: project owns "C"). Re-exported here for existing
// @openpanel/constants importers — same shape as
// packages/validation/src/import.validation.ts since M5-004.
export { ProjectTypeNames } from '@openpanel/core/modules/project/project.constants';
// Moved into @openpanel/core's report module (M7-006, ADR-008's module map:
// report owns "C" for the chart/report/widget vocabulary — timeWindows,
// operators, chartTypes, chartColors, intervals + helpers, countries,
// NOT_SET_VALUE, alphabetIds, metrics and friends). Re-exported here for
// existing @openpanel/constants importers (apps/start's report builder, the
// chart engine, apps/api's insights controller) — same shape as
// `ProjectTypeNames`'s re-export since M6-002.
export * from '@openpanel/core/modules/report/report.constants';
