import Image from 'next/image';
import { FeatureCardContainer } from './feature-card';
import { cn } from '@/lib/utils';

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

  if (!(darkSrc && lightSrc)) {
    throw new Error(
      'WindowImage requires either src or both srcDark and srcLight'
    );
  }

  return (
    <FeatureCardContainer
      className={cn([
        'relative z-10 overflow-hidden rounded-lg border border-border bg-foreground/10 p-4 shadow-lg/5 md:p-16 [@media(min-width:1100px)]:-mx-16',
        className,
      ])}
    >
      <div className="col relative gap-2 overflow-hidden rounded-lg border bg-card/80 p-2">
        {/* Window controls */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="size-2 rounded-full bg-red-500" />
            <div className="size-2 rounded-full bg-yellow-500" />
            <div className="size-2 rounded-full bg-green-500" />
          </div>
        </div>
        <div className="relative w-full overflow-hidden rounded-md border">
          <Image
            alt={alt}
            className="hidden h-auto w-full dark:block"
            height={800}
            src={darkSrc}
            width={1200}
          />
          <Image
            alt={alt}
            className="h-auto w-full dark:hidden"
            height={800}
            src={lightSrc}
            width={1200}
          />
        </div>
      </div>
      {caption && (
        <figcaption className="mx-auto max-w-lg text-center text-muted-foreground text-sm">
          {caption}
        </figcaption>
      )}
    </FeatureCardContainer>
  );
}
