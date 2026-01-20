import type { z } from 'zod';
import { EmailInvite, zEmailInvite } from './email-invite';
import EmailResetPassword, {
  zEmailResetPassword,
} from './email-reset-password';
import TrailEndingSoon, { zTrailEndingSoon } from './trial-ending-soon';
import OnboardingWelcome, {
  zOnboardingWelcome,
} from './onboarding-welcome';
import OnboardingWhatToTrack, {
  zOnboardingWhatToTrack,
} from './onboarding-what-to-track';
import OnboardingDashboards, {
  zOnboardingDashboards,
} from './onboarding-dashboards';
import OnboardingReplaceStack, {
  zOnboardingReplaceStack,
} from './onboarding-replace-stack';
import OnboardingTrialEnding, {
  zOnboardingTrialEnding,
} from './onboarding-trial-ending';

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
  },
  'onboarding-welcome': {
    subject: () => "You're in",
    Component: OnboardingWelcome,
    schema: zOnboardingWelcome,
  },
  'onboarding-what-to-track': {
    subject: () => "What's actually worth tracking",
    Component: OnboardingWhatToTrack,
    schema: zOnboardingWhatToTrack,
  },
  'onboarding-dashboards': {
    subject: () => 'The part most people skip',
    Component: OnboardingDashboards,
    schema: zOnboardingDashboards,
  },
  'onboarding-replace-stack': {
    subject: () => 'One provider to rule them all',
    Component: OnboardingReplaceStack,
    schema: zOnboardingReplaceStack,
  },
  'onboarding-trial-ending': {
    subject: () => 'Your trial ends in a few days',
    Component: OnboardingTrialEnding,
    schema: zOnboardingTrialEnding,
  },
} as const;

export type Templates = typeof templates;
export type TemplateKey = keyof Templates;
