import { theme } from '@/utils/theme';
import { useMediaQuery } from 'react-responsive';
import type { ScreensConfig } from 'tailwindcss/types/config';

const breakpoints = theme?.screens ?? {
  xs: '480px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
};

export function useBreakpoint<K extends string>(breakpointKey: K) {
  const breakpointValue = breakpoints[breakpointKey as keyof ScreensConfig];
  const bool = useMediaQuery({
    query: `(max-width: ${breakpointValue as string})`,
  });
  const capitalizedKey =
    breakpointKey[0]?.toUpperCase() + breakpointKey.substring(1);

  type KeyAbove = `isAbove${Capitalize<K>}`;
  type KeyBelow = `isBelow${Capitalize<K>}`;

  return {
    [breakpointKey]: Number(String(breakpointValue).replace(/[^0-9]/g, '')),
    [`isAbove${capitalizedKey}`]: !bool,
    [`isBelow${capitalizedKey}`]: bool,
  } as Record<K, number> & Record<KeyAbove | KeyBelow, boolean>;
}
