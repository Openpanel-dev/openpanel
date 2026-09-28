const BASE_TITLE = 'OpenPanel.dev';

export function createTitle(
  pageTitle: string,
  section?: string,
  baseTitle = BASE_TITLE
): string {
  const parts = [pageTitle];
  if (section) {
    parts.push(section);
  }
  parts.push(baseTitle);
  return parts.join(' | ');
}

export function createOrganizationTitle(
  pageTitle: string,
  organizationName?: string
): string {
  if (organizationName) {
    return createTitle(pageTitle, organizationName);
  }
  return createTitle(pageTitle, 'Organization');
}

export function createProjectTitle(
  pageTitle: string,
  projectName?: string,
  organizationName?: string
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

export function createEntityTitle(
  entityName: string,
  entityType: string,
  projectName?: string,
  organizationName?: string
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
  INSIGHTS: 'Insights',
  // Profiles
  PROFILES: 'Profiles',
  PROFILE_EVENTS: 'Profile events',
  PROFILE_DETAILS: 'Profile details',
  // Groups
  GROUPS: 'Groups',
  GROUP_DETAILS: 'Group details',
  // Cohorts
  COHORTS: 'Cohorts',
  COHORT_DETAIL: 'Cohort',
  COHORT_MEMBERS: 'Cohort members',
  COHORT_EVENTS: 'Cohort events',

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
