'use client';

import { useOpenPanel } from '@openpanel/nextjs';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function ScrollTracker() {
  const { track } = useOpenPanel();
  const pathname = usePathname();
  const hasFired = useRef(false);

  useEffect(() => {
    hasFired.current = false;

    const handleScroll = () => {
      if (hasFired.current) {
        return;
      }

      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const percent =
        docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

      if (percent >= 50) {
        hasFired.current = true;
        track('scroll_half_way', { percent: Math.round(percent) });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [track, pathname]);

  return null;
}
