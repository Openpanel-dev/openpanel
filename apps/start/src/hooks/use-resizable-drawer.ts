import { useCallback, useEffect, useRef, useState } from 'react';

type Options = {
  /** Default width if nothing is stored. */
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** localStorage key for width persistence. */
  storageKey: string;
  /** Which edge has the handle. Default 'left' (right-anchored drawer). */
  edge?: 'left' | 'right';
};

type Result = {
  width: number;
  /** Spread on the resize handle div. */
  dragHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    role: 'separator';
    'aria-orientation': 'vertical';
  };
};

/**
 * Drag-to-resize state for a side drawer. Owns width state, handles the
 * mousemove/mouseup listeners, and persists the result to localStorage
 * 300ms after the user stops dragging.
 *
 * Replaces ~30 lines of inline `useRef` + `addEventListener` + manual
 * cursor/userSelect tweaks in the consumer.
 */
export function useResizableDrawer({
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
  edge = 'left',
}: Options): Result {
  const [width, setWidth] = useState(defaultWidth);

  // Hydrate from localStorage on mount (avoids SSR mismatch).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    setWidth(Math.min(maxWidth, Math.max(minWidth, n)));
  }, [storageKey, minWidth, maxWidth]);

  // Persist on idle (debounced).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, String(width));
    }, 300);
    return () => window.clearTimeout(t);
  }, [width, storageKey]);

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: width };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx =
          edge === 'left'
            ? dragRef.current.startX - ev.clientX
            : ev.clientX - dragRef.current.startX;
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, dragRef.current.startWidth + dx),
        );
        setWidth(next);
      };

      const onUp = () => {
        dragRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [width, minWidth, maxWidth, edge],
  );

  return {
    width,
    dragHandleProps: {
      onMouseDown,
      role: 'separator',
      'aria-orientation': 'vertical',
    },
  };
}
