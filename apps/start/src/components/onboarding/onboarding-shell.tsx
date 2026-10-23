import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

export interface OnboardingShellConfig {
  /** 1-based position in STEP_NAMES. */
  step: number;
  /** The install step has a sidebar and needs the wider container. */
  wide: boolean;
}

export const STEP_NAMES = ['Create project', 'Install'] as const;

const DEFAULT_CONFIG: OnboardingShellConfig = { step: 1, wide: false };

const ShellContext = createContext<{
  config: OnboardingShellConfig;
  setConfig: (config: OnboardingShellConfig) => void;
} | null>(null);

export function OnboardingShellProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<OnboardingShellConfig>(DEFAULT_CONFIG);
  const value = useMemo(() => ({ config, setConfig }), [config]);
  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useOnboardingShellConfig(): OnboardingShellConfig {
  return useContext(ShellContext)?.config ?? DEFAULT_CONFIG;
}

/**
 * A step declares its own shell. The router knows the next location before
 * the next page commits, so deriving this from the route re-lays out the
 * shell around the old page for a frame; a layout effect from the page
 * itself updates the shell in the same paint as the page.
 */
export function useOnboardingShell(config: OnboardingShellConfig) {
  const context = useContext(ShellContext);
  const setConfig = context?.setConfig;
  useLayoutEffect(() => {
    setConfig?.(config);
  }, [setConfig, config.step, config.wide]);
}
