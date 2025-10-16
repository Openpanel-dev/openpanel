import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { useInViewport } from 'react-in-viewport';

export interface LazyComponentProps {
  /**
   * Whether to enable lazy loading. If false, component renders immediately.
   * @default true
   */
  lazy?: boolean;

  /**
   * Content to render when the component is in viewport (or immediately if lazy=false)
   */
  children: ReactNode;

  /**
   * Optional loading placeholder to show while waiting for viewport intersection
   */
  fallback?: ReactNode;

  /**
   * Additional className for the wrapper div
   */
  className?: string;

  /**
   * Custom viewport options for intersection observer
   */
  viewportOptions?: {
    rootMargin?: string;
    threshold?: number | number[];
  };

  /**
   * Whether to disconnect the intersection observer after first load
   * @default true
   */
  disconnectOnLeave?: boolean;
}

/**
 * A reusable lazy loading component that renders its children only when
 * they come into the viewport (or immediately if lazy=false).
 *
 * Uses intersection observer under the hood for efficient viewport detection.
 */
export const LazyComponent = ({
  lazy = true,
  children,
  fallback = null,
  className,
  viewportOptions,
  disconnectOnLeave = true,
}: LazyComponentProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const once = useRef(false);

  const { inViewport } = useInViewport(
    ref as RefObject<HTMLElement>,
    viewportOptions,
    {
      disconnectOnLeave,
    },
  );

  useEffect(() => {
    if (inViewport) {
      once.current = true;
    }
  }, [inViewport]);

  const shouldRender = lazy ? once.current || inViewport : true;

  return (
    <div ref={ref} className={className}>
      {shouldRender ? children : (fallback ?? <div />)}
    </div>
  );
};
