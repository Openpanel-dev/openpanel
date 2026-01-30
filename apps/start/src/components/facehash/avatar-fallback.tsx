import * as React from 'react';
import { useAvatarContext } from './avatar';
import { Facehash, type FacehashProps } from './facehash';

const WHITESPACE_REGEX = /\s+/;

export type AvatarFallbackProps = Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  'children'
> & {
  /**
   * The name to derive initials and Facehash from.
   */
  name?: string;

  /**
   * Delay in milliseconds before showing the fallback.
   * Useful to prevent flashing when images load quickly.
   * @default 0
   */
  delayMs?: number;

  /**
   * Custom children to render instead of initials or Facehash.
   */
  children?: React.ReactNode;

  /**
   * Use the Facehash component as fallback instead of initials.
   * @default true
   */
  facehash?: boolean;

  /**
   * Use Tailwind group-hover for hover detection.
   * When true, hover effect triggers when a parent with "group" class is hovered.
   * @default false
   */
  groupHover?: boolean;

  /**
   * Props to pass to the Facehash component.
   */
  facehashProps?: Omit<FacehashProps, 'name'>;
};

/**
 * Extracts initials from a name string.
 */
function getInitials(name: string): string {
  const parts = name.trim().split(WHITESPACE_REGEX);
  if (parts.length === 0) {
    return '';
  }
  if (parts.length === 1) {
    return parts[0]?.charAt(0).toUpperCase() || '';
  }

  const firstInitial = parts[0]?.charAt(0) || '';
  const lastInitial = parts.at(-1)?.charAt(0) || '';
  return (firstInitial + lastInitial).toUpperCase();
}

/**
 * Fallback component that displays when the image fails to load.
 * Uses Facehash by default, can show initials or custom content.
 */
export const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  AvatarFallbackProps
>(
  (
    {
      name = '',
      delayMs = 0,
      children,
      facehash = true,
      groupHover = false,
      facehashProps,
      className,
      style,
      ...props
    },
    ref,
  ) => {
    const { imageLoadingStatus } = useAvatarContext();
    const [canRender, setCanRender] = React.useState(delayMs === 0);

    React.useEffect(() => {
      if (delayMs > 0) {
        const timerId = window.setTimeout(() => setCanRender(true), delayMs);
        return () => window.clearTimeout(timerId);
      }
    }, [delayMs]);

    const initials = React.useMemo(() => getInitials(name), [name]);

    const shouldRender =
      canRender &&
      imageLoadingStatus !== 'loaded' &&
      imageLoadingStatus !== 'loading';

    if (!shouldRender) {
      return null;
    }

    // Custom children take precedence
    if (children) {
      return (
        <span
          ref={ref}
          className={className}
          style={style}
          data-avatar-fallback=""
          {...props}
        >
          {children}
        </span>
      );
    }

    // Facehash mode (default)
    if (facehash) {
      return (
        <Facehash
          ref={ref as React.Ref<HTMLDivElement>}
          name={name || '?'}
          size="100%"
          groupHover={groupHover}
          {...facehashProps}
          style={{
            ...style,
          }}
          {...props}
        />
      );
    }

    // Initials mode
    return (
      <span
        ref={ref}
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          ...style,
        }}
        data-avatar-fallback=""
        {...props}
      >
        {initials}
      </span>
    );
  },
);

AvatarFallback.displayName = 'AvatarFallback';
