import { cn } from '@/utils/cn';
import { AvatarImage } from '@radix-ui/react-avatar';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

import { type GetProfileNameProps, getProfileName } from '@/utils/getters';
import { Avatar, AvatarFallback } from '../ui/avatar';

interface ProfileAvatarProps
  extends VariantProps<typeof variants>,
    GetProfileNameProps {
  className?: string;
  avatar?: string;
}

const variants = cva('shrink-0', {
  variants: {
    size: {
      lg: 'h-14 w-14 rounded [&>span]:rounded',
      default: 'h-8 w-8 rounded [&>span]:rounded',
      sm: 'h-6 w-6 rounded [&>span]:rounded',
      xs: 'h-4 w-4 rounded [&>span]:rounded',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export function ProfileAvatar({
  avatar,
  className,
  size,
  ...profile
}: ProfileAvatarProps) {
  const name = getProfileName(profile);
  console.log('name', name);

  return (
    <Avatar className={cn(variants({ className, size }), className)}>
      {avatar && <AvatarImage src={avatar} className="rounded-full" />}
      <AvatarFallback
        className={cn(
          'rounded-full',
          size === 'lg'
            ? 'text-lg'
            : size === 'sm'
              ? 'text-sm'
              : size === 'xs'
                ? 'text-[8px]'
                : 'text-base',
          'bg-def-200 text-muted-foreground',
        )}
      >
        {name?.at(0)?.toUpperCase() ?? '🫣'}
      </AvatarFallback>
    </Avatar>
  );
}
