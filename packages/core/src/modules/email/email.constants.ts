// Moved from packages/constants/index.ts (M6-004, ADR-008's module map:
// email owns "C"). packages/constants re-exports these for existing
// packages/constants importers — same shape as packages/constants/index.ts's
// `ProjectTypeNames` re-export since M6-002.
//
// Keys must match the template `category` in @openpanel/email. Each entry's
// label + description drive the account email-preferences toggles.
export const emailCategories = {
  onboarding: {
    label: 'Onboarding',
    description: 'Get started tips and guidance emails',
  },
  weekly_digest: {
    label: 'Weekly digest',
    description: 'A weekly summary of your analytics with AI-surfaced insights',
  },
  product_alerts: {
    label: 'Product alerts',
    description:
      'Important notices about your projects: tracking stopped sending data, event limits, and alerts from your notification rules',
  },
  // Kept separate from `onboarding` on purpose: opting out of getting-started
  // tips must not also opt you out of being told your account is winding down.
  // The final deletion warning has no category at all, so it always sends.
  account_lifecycle: {
    label: 'Account status',
    description:
      'Notices about your trial ending, event ingestion being paused, and data scheduled for removal',
  },
} as const;

export type EmailCategory = keyof typeof emailCategories;
