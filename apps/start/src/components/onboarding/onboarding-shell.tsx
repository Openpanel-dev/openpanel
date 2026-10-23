import { useMatches } from '@tanstack/react-router';

export interface OnboardingShellConfig {
  /** 1-based position in STEP_NAMES. */
  step: number;
  /** The install step has a sidebar and needs the wider container. */
  wide: boolean;
}

export const STEP_NAMES = ['Create project', 'Install'] as const;

const SHELL_BY_ROUTE: Record<string, OnboardingShellConfig> = {
  '/_steps/onboarding/project': { step: 1, wide: false },
  '/_steps/onboarding/$projectId/connect': { step: 2, wide: true },
};

const DEFAULT_CONFIG: OnboardingShellConfig = { step: 1, wide: false };

/**
 * Read from the committed matches, which change in the same render as the
 * page the Outlet shows, so the frame and the step never disagree: not on
 * the server, not on hydration and not for a frame during navigation.
 * (Location-based matching flips as soon as a navigation starts.)
 */
export function useOnboardingShellConfig(): OnboardingShellConfig {
  return useMatches({
    select: (matches) => {
      const stepMatch = matches.find(
        (match) => match.routeId in SHELL_BY_ROUTE
      );
      return stepMatch ? SHELL_BY_ROUTE[stepMatch.routeId] : DEFAULT_CONFIG;
    },
    structuralSharing: true,
  });
}
