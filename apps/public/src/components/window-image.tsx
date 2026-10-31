import Image from 'next/image';
import { FeatureCardContainer } from './feature-card';
import { isVisualMockName, VisualMock } from './visual-mock';
import { cn } from '@/lib/utils';

interface WindowImageProps {
  // Name of a VisualMock; when set, no image is rendered.
  mock?: string;
  src?: string;
  // Content files still carry a dark variant; the site only renders the light one.
  srcDark?: string;
  srcLight?: string;
  alt: string;
  className?: string;
  caption?: string;
}

export function WindowImage({
  mock,
  src,
  srcLight,
  alt,
  caption,
  className,
}: WindowImageProps) {
  if (mock && isVisualMockName(mock)) {
    return (
      <figure className={cn('col gap-4', className)}>
        <VisualMock name={mock} />
        {caption && (
          <figcaption className="mx-auto max-w-lg text-center text-muted-foreground text-sm">
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  const imageSrc = srcLight || src;

  if (!imageSrc) {
    throw new Error('WindowImage requires src or srcLight');
  }

  return (
    <FeatureCardContainer
      className={cn([
        'relative z-10 overflow-hidden rounded-lg border border-border bg-foreground/10 p-4 shadow-lg/5 md:p-16 [@media(min-width:1100px)]:-mx-16',
        className,
      ])}
    >
      <div className="col relative gap-2 overflow-hidden rounded-lg border bg-card/80 p-2">
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
            className="h-auto w-full"
            height={800}
            src={imageSrc}
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
