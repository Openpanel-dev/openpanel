import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Font sizes added in styles.css; without this tailwind-merge reads `text-nav`
// as a color and drops the real color class next to it.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': ['text-2xs', 'text-nav'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
