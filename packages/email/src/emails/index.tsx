import type { z } from 'zod';
import { EmailInvite, zEmailInvite } from './email-invite';
import EmailResetPassword, {
  zEmailResetPassword,
} from './email-reset-password';
import OnboardingDashboards, {
  zOnboardingDashboards,
} from './onboarding-dashboards';
import OnboardingFeatureRequest, {
  zOnboardingFeatureRequest,
} from './onboarding-feature-request';
import OnboardingTrialEnded, {
  zOnboardingTrialEnded,
} from './onboarding-trial-ended';
import OnboardingTrialEnding, {
  zOnboardingTrialEnding,
} from './onboarding-trial-ending';
import OnboardingWelcome, { zOnboardingWelcome } from './onboarding-welcome';
import OnboardingWhatToTrack, {
  zOnboardingWhatToTrack,
} from './onboarding-what-to-track';

export const templates = {
  invite: {
    subject: (data: z.infer<typeof zEmailInvite>) =>
      `Invite to join ${data.organizationName}`,
    Component: EmailInvite,
    schema: zEmailInvite,
  },
  'reset-password': {
    subject: (data: z.infer<typeof zEmailResetPassword>) =>
      'Reset your password',
    Component: EmailResetPassword,
    schema: zEmailResetPassword,
  },
  'onboarding-welcome': {
    subject: () => 'Welcome to OpenPanel',
    Component: OnboardingWelcome,
    schema: zOnboardingWelcome,
    category: 'onboarding' as const,
  },
  'onboarding-what-to-track': {
    subject: (data: z.infer<typeof zOnboardingWhatToTrack>) =>
      data.hasData ? 'What to track first' : 'Stuck on the install?',
    Component: OnboardingWhatToTrack,
    schema: zOnboardingWhatToTrack,
    category: 'onboarding' as const,
  },
  'onboarding-dashboards': {
    subject: (data: z.infer<typeof zOnboardingDashboards>) =>
      data.hasData ? 'Your first dashboard' : 'A week in, no data yet',
    Component: OnboardingDashboards,
    schema: zOnboardingDashboards,
    category: 'onboarding' as const,
  },
  'onboarding-feature-request': {
    subject: () => 'Anything missing?',
    Component: OnboardingFeatureRequest,
    schema: zOnboardingFeatureRequest,
    category: 'onboarding' as const,
  },
  'onboarding-trial-ending': {
    subject: (data: z.infer<typeof zOnboardingTrialEnding>) =>
      data.trialEndDate
        ? `Your OpenPanel trial ends ${data.trialEndDate}`
        : 'Your OpenPanel trial ends soon',
    Component: OnboardingTrialEnding,
    schema: zOnboardingTrialEnding,
  },
  'onboarding-trial-ended': {
    subject: () => 'Your trial ended, dashboard is locked',
    Component: OnboardingTrialEnded,
    schema: zOnboardingTrialEnded,
  },
} as const;

export type Templates = typeof templates;
export type TemplateKey = keyof Templates;
