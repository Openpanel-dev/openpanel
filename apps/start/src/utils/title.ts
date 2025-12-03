/**
 * Utility functions for generating page titles
 */

const BASE_TITLE = 'OpenPanel.dev';

/**
 * Creates a hierarchical title with the format: "Page Title | Section | OpenPanel.dev"
 */
export function createTitle(
  pageTitle: string,
  section?: string,
  baseTitle = BASE_TITLE,
): string {
  const parts = [pageTitle];
  if (section) {
    parts.push(section);
  }
  parts.push(baseTitle);
  return parts.join(' | ');
}

/**
 * Creates a title for organization-level pages
 */
export function createOrganizationTitle(
  pageTitle: string,
  organizationName?: string,
): string {
  if (organizationName) {
    return createTitle(pageTitle, organizationName);
  }
  return createTitle(pageTitle, 'Organization');
}

/**
 * Creates a title for project-level pages
 */
export function createProjectTitle(
  pageTitle: string,
  projectName?: string,
  organizationName?: string,
): string {
  const parts = [pageTitle];
  if (projectName) {
    parts.push(projectName);
  }
  if (organizationName) {
    parts.push(organizationName);
  }
  parts.push(BASE_TITLE);
  return parts.join(' | ');
}

/**
 * Creates a title for specific entity pages (reports, sessions, etc.)
 */
export function createEntityTitle(
  entityName: string,
  entityType: string,
  projectName?: string,
  organizationName?: string,
): string {
  const parts = [entityName, entityType];
  if (projectName) {
    parts.push(projectName);
  }
  if (organizationName) {
    parts.push(organizationName);
  }
  parts.push(BASE_TITLE);
  return parts.join(' | ');
}

/**
 * Common page titles
 */
export const PAGE_TITLES = {
  // Main sections
  DASHBOARD: 'Dashboard',
  EVENTS: 'Events',
  SESSIONS: 'Sessions',
  PAGES: 'Pages',
  REPORTS: 'Reports',
  NOTIFICATIONS: 'Notifications',
  SETTINGS: 'Settings',
  INTEGRATIONS: 'Integrations',
  MEMBERS: 'Members',
  BILLING: 'Billing',
  CHAT: 'AI Assistant',
  REALTIME: 'Realtime',
  REFERENCES: 'References',
  // Profiles
  PROFILES: 'Profiles',
  PROFILE_EVENTS: 'Profile events',
  PROFILE_DETAILS: 'Profile details',

  // Sub-sections
  CONVERSIONS: 'Conversions',
  STATS: 'Statistics',
  ANONYMOUS: 'Anonymous',
  IDENTIFIED: 'Identified',
  POWER_USERS: 'Power Users',
  CLIENTS: 'Clients',
  DETAILS: 'Details',
  AVAILABLE: 'Available',
  INSTALLED: 'Installed',
  INVITATIONS: 'Invitations',

  // Actions
  CREATE: 'Create',
  EDIT: 'Edit',
  DELETE: 'Delete',

  // Onboarding
  ONBOARDING: 'Getting Started',
  CONNECT: 'Connect',
  VERIFY: 'Verify',
  PROJECT: 'Project',
  PROJECTS: 'Projects',

  // Auth
  LOGIN: 'Login',
  RESET_PASSWORD: 'Reset Password',

  // Share
  SHARE: 'Shared Dashboard',
} as const;
