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
import TrailEndingSoon, { zTrailEndingSoon } from './trial-ending-soon';

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
  'trial-ending-soon': {
    subject: (data: z.infer<typeof zTrailEndingSoon>) =>
      'Your trial is ending soon',
    Component: TrailEndingSoon,
    schema: zTrailEndingSoon,
    category: 'billing' as const,
  },
  'onboarding-welcome': {
    subject: () => "You're in",
    Component: OnboardingWelcome,
    schema: zOnboardingWelcome,
    category: 'onboarding' as const,
  },
  'onboarding-what-to-track': {
    subject: () => "What's actually worth tracking",
    Component: OnboardingWhatToTrack,
    schema: zOnboardingWhatToTrack,
    category: 'onboarding' as const,
  },
  'onboarding-dashboards': {
    subject: () => 'The part most people skip',
    Component: OnboardingDashboards,
    schema: zOnboardingDashboards,
    category: 'onboarding' as const,
  },
  'onboarding-featue-request': {
    subject: () => 'One provider to rule them all',
    Component: OnboardingFeatureRequest,
    schema: zOnboardingFeatureRequest,
    category: 'onboarding' as const,
  },
  'onboarding-trial-ending': {
    subject: () => 'Your trial ends in a few days',
    Component: OnboardingTrialEnding,
    schema: zOnboardingTrialEnding,
    category: 'onboarding' as const,
  },
  'onboarding-trial-ended': {
    subject: () => 'Your trial has ended',
    Component: OnboardingTrialEnded,
    schema: zOnboardingTrialEnded,
    category: 'onboarding' as const,
  },
} as const;

export type Templates = typeof templates;
export type TemplateKey = keyof Templates;
