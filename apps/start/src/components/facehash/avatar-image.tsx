import * as React from 'react';
import { useAvatarContext } from './avatar';

type ImageLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type AvatarImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src'
> & {
  /**
   * The image source URL. If empty or undefined, triggers error state.
   */
  src?: string | null;

  /**
   * Callback when the image loading status changes.
   */
  onLoadingStatusChange?: (status: ImageLoadingStatus) => void;
};

/**
 * Image component that syncs its loading state with the Avatar context.
 * Automatically hides when loading fails, allowing fallback to show.
 */
export const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  (
    { src, alt = '', className, style, onLoadingStatusChange, ...props },
    ref,
  ) => {
    const { imageLoadingStatus, onImageLoadingStatusChange } =
      useAvatarContext();

    const imageRef = React.useRef<HTMLImageElement>(null);
    React.useImperativeHandle(ref, () => imageRef.current!);

    const updateStatus = React.useCallback(
      (status: ImageLoadingStatus) => {
        onImageLoadingStatusChange(status);
        onLoadingStatusChange?.(status);
      },
      [onImageLoadingStatusChange, onLoadingStatusChange],
    );

    React.useLayoutEffect(() => {
      if (!src) {
        updateStatus('error');
        return;
      }

      let isMounted = true;
      const image = new Image();

      const setStatus = (status: ImageLoadingStatus) => {
        if (!isMounted) {
          return;
        }
        updateStatus(status);
      };

      setStatus('loading');

      image.onload = () => setStatus('loaded');
      image.onerror = () => setStatus('error');
      image.src = src;

      return () => {
        isMounted = false;
      };
    }, [src, updateStatus]);

    if (imageLoadingStatus !== 'loaded') {
      return null;
    }

    return (
      <img
        ref={imageRef}
        src={src || undefined}
        alt={alt}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          ...style,
        }}
        data-avatar-image=""
        {...props}
      />
    );
  },
);

AvatarImage.displayName = 'AvatarImage';
