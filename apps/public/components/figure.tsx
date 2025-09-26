import { cn } from '@/lib/utils';
import Image from 'next/image';

export function Figure({
  src,
  alt,
  caption,
  className,
}: { src: string; alt: string; caption: string; className?: string }) {
  return (
    <figure className={cn('-mx-4', className)}>
      <Image
        src={src}
        alt={alt || caption}
        width={1200}
        height={800}
        className="rounded-lg"
      />
      <figcaption className="text-center text-sm text-muted-foreground mt-2">
        {caption}
      </figcaption>
    </figure>
  );
}
