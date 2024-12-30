import { cn } from '@/lib/utils';
import Image, { type ImageProps } from 'next/image';

type SwirlProps = Omit<ImageProps, 'src' | 'alt'>;

export function SingleSwirl({ className, ...props }: SwirlProps) {
  return (
    <Image
      {...props}
      src="/swirl-2.png"
      alt="Swirl"
      className={cn(
        'pointer-events-none w-full h-full object-cover',
        className,
      )}
      width={1200}
      height={1200}
    />
  );
}

export function DoubleSwirl({ className, ...props }: SwirlProps) {
  return (
    <Image
      {...props}
      src="/swirl.png"
      alt="Swirl"
      className={cn(
        'pointer-events-none w-full h-full object-cover',
        className,
      )}
      width={1200}
      height={1200}
    />
  );
}
