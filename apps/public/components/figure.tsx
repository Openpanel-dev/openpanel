import Image from 'next/image';

export function Figure({
  src,
  alt,
  caption,
}: { src: string; alt: string; caption: string }) {
  return (
    <figure className="-mx-4">
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
