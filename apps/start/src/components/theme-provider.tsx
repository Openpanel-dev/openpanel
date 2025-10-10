import { mapKeys } from '@openpanel/validation';
import { ScriptOnce } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { type ReactNode, createContext, use, useEffect, useState } from 'react';
import { z } from 'zod';

const UserThemeSchema = z.enum(['light', 'dark', 'system']).catch('system');
const AppThemeSchema = z.enum(['light', 'dark']).catch('light');

const clientOnly = <T extends (...args: any[]) => void>(fn: T) => {
  if (typeof window === 'undefined') return (() => {}) as unknown as T;
  return fn;
};

export type UserTheme = z.infer<typeof UserThemeSchema>;
export type AppTheme = z.infer<typeof AppThemeSchema>;

const themeStorageKey = 'ui-theme';

const getStoredUserTheme = createIsomorphicFn()
  .server((): UserTheme => 'system')
  .client((): UserTheme => {
    const stored = localStorage.getItem(themeStorageKey);
    return UserThemeSchema.parse(stored);
  });

const setStoredTheme = clientOnly((theme: UserTheme) => {
  const validatedTheme = UserThemeSchema.parse(theme);
  localStorage.setItem(themeStorageKey, validatedTheme);
});

const getSystemTheme = createIsomorphicFn()
  .server((): AppTheme => 'light')
  .client((): AppTheme => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

const handleThemeChange = clientOnly((userTheme: UserTheme) => {
  const validatedTheme = UserThemeSchema.parse(userTheme);

  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'system');

  if (validatedTheme === 'system') {
    const systemTheme = getSystemTheme();
    root.classList.add(systemTheme, 'system');
  } else {
    root.classList.add(validatedTheme);
  }
});

const setupPreferredListener = clientOnly(() => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => handleThemeChange('system');
  mediaQuery.addEventListener('change', handler);
  return () => mediaQuery.removeEventListener('change', handler);
});

export const themeConfig: Record<UserTheme, { icon: string; label: string }> = {
  light: { icon: '☀️', label: 'Light' },
  dark: { icon: '🌒', label: 'Dark' },
  system: { icon: '💻', label: 'System' },
};

const themes = mapKeys(themeConfig).map((key) => ({
  key,
  ...themeConfig[key],
}));

const themeScript = (() => {
  function themeFn() {
    try {
      const storedTheme = localStorage.getItem('ui-theme') || 'system';
      const validTheme = ['light', 'dark', 'system'].includes(storedTheme)
        ? storedTheme
        : 'system';

      if (validTheme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
          .matches
          ? 'dark'
          : 'light';
        document.documentElement.classList.add(systemTheme, 'system');
      } else {
        document.documentElement.classList.add(validTheme);
      }
    } catch (e) {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';
      document.documentElement.classList.add(systemTheme, 'system');
    }
  }
  return `(${themeFn.toString()})();`;
})();

export const ThemeScriptOnce = () => {
  return <ScriptOnce>{themeScript}</ScriptOnce>;
};

type ThemeContextProps = {
  userTheme: UserTheme;
  appTheme: AppTheme;
  theme: AppTheme;
  setTheme: (theme: UserTheme) => void;
  getNextTheme: () => UserTheme;
  themes: typeof themes;
};
const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [userTheme, setUserTheme] = useState<UserTheme>(getStoredUserTheme);

  useEffect(() => {
    if (userTheme !== 'system') return;
    return setupPreferredListener();
  }, [userTheme]);

  const appTheme = userTheme === 'system' ? getSystemTheme() : userTheme;

  const setTheme = (newUserTheme: UserTheme) => {
    const validatedTheme = UserThemeSchema.parse(newUserTheme);
    setUserTheme(validatedTheme);
    setStoredTheme(validatedTheme);
    handleThemeChange(validatedTheme);
  };

  const getNextTheme = () => {
    const themes = Object.keys(themeConfig) as UserTheme[];
    const currentIndex = themes.indexOf(userTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    return themes[nextIndex];
  };

  return (
    <ThemeContext
      value={{
        userTheme,
        appTheme,
        theme: appTheme,
        setTheme,
        getNextTheme,
        themes,
      }}
    >
      {children}
    </ThemeContext>
  );
}

export const useTheme = () => {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
