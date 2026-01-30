import * as React from 'react';

type ImageLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type AvatarContextValue = {
  imageLoadingStatus: ImageLoadingStatus;
  onImageLoadingStatusChange: (status: ImageLoadingStatus) => void;
};

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

/**
 * Hook to access the Avatar context.
 * Throws an error if used outside of Avatar.
 */
export const useAvatarContext = () => {
  const context = React.useContext(AvatarContext);
  if (!context) {
    throw new Error(
      'Avatar compound components must be rendered within an Avatar component',
    );
  }
  return context;
};

export type AvatarProps = React.HTMLAttributes<HTMLSpanElement> & {
  /**
   * Render as a different element using the asChild pattern.
   * When true, Avatar renders its child and merges props.
   */
  asChild?: boolean;
};

/**
 * Root avatar component that provides context for image loading state.
 */
export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ children, className, style, asChild = false, ...props }, ref) => {
    const [imageLoadingStatus, setImageLoadingStatus] =
      React.useState<ImageLoadingStatus>('idle');

    const contextValue: AvatarContextValue = React.useMemo(
      () => ({
        imageLoadingStatus,
        onImageLoadingStatusChange: setImageLoadingStatus,
      }),
      [imageLoadingStatus],
    );

    const Element = asChild ? React.Fragment : 'span';
    const elementProps = asChild
      ? {}
      : {
          ref,
          className,
          style: {
            position: 'relative' as const,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            ...style,
          },
          'data-avatar': '',
          'data-state': imageLoadingStatus,
          ...props,
        };

    return (
      <AvatarContext.Provider value={contextValue}>
        <Element {...elementProps}>{children}</Element>
      </AvatarContext.Provider>
    );
  },
);

Avatar.displayName = 'Avatar';
