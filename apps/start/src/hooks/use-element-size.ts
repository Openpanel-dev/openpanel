import { useCallback, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

/** The element's content-box size, kept current by a ResizeObserver. */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  const ref = useCallback((element: T | null) => {
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height }
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
