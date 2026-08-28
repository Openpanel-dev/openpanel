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
import OnboardingTrialEnding, {
  zOnboardingTrialEnding,
} from './onboarding-trial-ending';
import NotificationRule, { zNotificationRule } from './notification-rule';
import OnboardingWelcome, { zOnboardingWelcome } from './onboarding-welcome';
import OnboardingWhatToTrack, {
  zOnboardingWhatToTrack,
} from './onboarding-what-to-track';
import TrackingDataStopped, {
  zTrackingDataStopped,
} from './tracking-data-stopped';
import TrackingNoData, { zTrackingNoData } from './tracking-no-data';
import UsageLimitExceeded, {
  zUsageLimitExceeded,
} from './usage-limit-exceeded';
import UsageNearLimit, { zUsageNearLimit } from './usage-near-limit';
import WeeklyDigest, { zWeeklyDigest } from './weekly-digest';
import WindDownBlocked, { zWindDownBlocked } from './wind-down-blocked';
import WindDownExpired, { zWindDownExpired } from './wind-down-expired';
import WindDownFinalWarning, {
  zWindDownFinalWarning,
} from './wind-down-final-warning';
import WindDownStoppingSoon, {
  zWindDownStoppingSoon,
} from './wind-down-stopping-soon';

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
    // Without a category these bypassed unsubscribe entirely (no suppression
    // check, no List-Unsubscribe header).
    category: 'onboarding' as const,
  },
  'wind-down-expired': {
    subject: (data: z.infer<typeof zWindDownExpired>) =>
      data.stillTracking
        ? "You're still sending events, but your trial ended"
        : 'Your trial ended, dashboard is locked',
    Component: WindDownExpired,
    schema: zWindDownExpired,
    category: 'account_lifecycle' as const,
  },
  'wind-down-stopping-soon': {
    subject: (data: z.infer<typeof zWindDownStoppingSoon>) =>
      `We stop recording your events on ${data.blockDate}`,
    Component: WindDownStoppingSoon,
    schema: zWindDownStoppingSoon,
    category: 'account_lifecycle' as const,
  },
  'wind-down-blocked': {
    subject: (data: z.infer<typeof zWindDownBlocked>) =>
      data.stillTracking
        ? 'Your events are no longer being recorded'
        : 'Event tracking paused for your projects',
    Component: WindDownBlocked,
    schema: zWindDownBlocked,
    category: 'account_lifecycle' as const,
  },
  'wind-down-final-warning': {
    subject: (data: z.infer<typeof zWindDownFinalWarning>) =>
      `Final notice: your data is deleted on ${data.deleteDate}`,
    Component: WindDownFinalWarning,
    schema: zWindDownFinalWarning,
    // Deliberately uncategorised, which makes it transactional: no suppression
    // check and no unsubscribe link. Telling someone their data is about to be
    // erased is a service notice, not marketing, and it must not be silenced
    // by an earlier opt-out.
  },
  'weekly-digest': {
    subject: (data: z.infer<typeof zWeeklyDigest>) =>
      `Your week on ${data.projectName}`,
    Component: WeeklyDigest,
    schema: zWeeklyDigest,
    category: 'weekly_digest' as const,
  },
  'usage-near-limit': {
    subject: (data: z.infer<typeof zUsageNearLimit>) =>
      `You've used ${Math.round((data.eventsCount / data.eventsLimit) * 100)}% of your monthly events`,
    Component: UsageNearLimit,
    schema: zUsageNearLimit,
    category: 'product_alerts' as const,
  },
  'usage-limit-exceeded': {
    subject: () => 'Event limit reached — charts paused, data still collected',
    Component: UsageLimitExceeded,
    schema: zUsageLimitExceeded,
    category: 'product_alerts' as const,
  },
  'tracking-no-data': {
    subject: () => "Your tracking isn't sending data yet",
    Component: TrackingNoData,
    schema: zTrackingNoData,
    category: 'product_alerts' as const,
  },
  'tracking-data-stopped': {
    subject: (data: z.infer<typeof zTrackingDataStopped>) =>
      data.projectNames.length === 1
        ? `${data.projectNames[0]} stopped sending events`
        : 'Some of your projects stopped sending events',
    Component: TrackingDataStopped,
    schema: zTrackingDataStopped,
    category: 'product_alerts' as const,
  },
  'notification-rule': {
    subject: (data: z.infer<typeof zNotificationRule>) => data.title,
    Component: NotificationRule,
    schema: zNotificationRule,
    category: 'product_alerts' as const,
  },
} as const;

export type Templates = typeof templates;
export type TemplateKey = keyof Templates;
