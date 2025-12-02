import { cn } from '@/lib/utils';
import Image from 'next/image';
import { FeatureCardContainer } from './feature-card';

interface WindowImageProps {
  src?: string;
  srcDark?: string;
  srcLight?: string;
  alt: string;
  className?: string;
  caption?: string;
}

export function WindowImage({
  src,
  srcDark,
  srcLight,
  alt,
  caption,
  className,
}: WindowImageProps) {
  // If src is provided, use it for both (backward compatibility)
  // Otherwise, use srcDark and srcLight
  const darkSrc = srcDark || src;
  const lightSrc = srcLight || src;

  if (!darkSrc || !lightSrc) {
    throw new Error(
      'WindowImage requires either src or both srcDark and srcLight',
    );
  }

  return (
    <FeatureCardContainer
      className={cn([
        'overflow-hidden rounded-lg border border-border bg-background shadow-lg/5 relative z-10 [@media(min-width:1100px)]:-mx-16 p-4 md:p-16',
        className,
      ])}
    >
      <div className="rounded-lg overflow-hidden p-2 bg-card/80 border col gap-2 relative">
        {/* Window controls */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="size-2 rounded-full bg-red-500" />
            <div className="size-2 rounded-full bg-yellow-500" />
            <div className="size-2 rounded-full bg-green-500" />
          </div>
        </div>
        <div className="relative w-full border rounded-md overflow-hidden">
          <Image
            src={darkSrc}
            alt={alt}
            width={1200}
            height={800}
            className="hidden dark:block w-full h-auto"
          />
          <Image
            src={lightSrc}
            alt={alt}
            width={1200}
            height={800}
            className="dark:hidden w-full h-auto"
          />
        </div>
      </div>
      {caption && (
        <figcaption className="text-center text-sm text-muted-foreground max-w-lg mx-auto">
          {caption}
        </figcaption>
      )}
    </FeatureCardContainer>
  );
}
