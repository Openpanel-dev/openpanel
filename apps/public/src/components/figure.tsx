import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Figure({
  src,
  alt,
  caption,
  className,
}: {
  src: string;
  alt: string;
  caption: string;
  className?: string;
}) {
  return (
    <figure className={cn('-mx-4', className)}>
      <Image
        alt={alt || caption}
        className="rounded-lg"
        height={800}
        src={src}
        width={1200}
      />
      <figcaption className="mt-2 text-center text-muted-foreground text-sm">
        {caption}
      </figcaption>
    </figure>
  );
}
