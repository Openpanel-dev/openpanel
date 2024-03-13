'use client';

import { cn } from '@/utils/cn';
import { AvatarImage } from '@radix-ui/react-avatar';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

import type { IServiceProfile } from '@openpanel/db';

import { Avatar, AvatarFallback } from '../ui/avatar';

interface ProfileAvatarProps
  extends VariantProps<typeof variants>,
    Partial<Pick<IServiceProfile, 'avatar' | 'first_name'>> {
  className?: string;
}

const variants = cva('', {
  variants: {
    size: {
      default: 'h-12 w-12 rounded-full [&>span]:rounded-full',
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
  first_name,
  className,
  size,
}: ProfileAvatarProps) {
  return (
    <Avatar className={cn(variants({ className, size }), className)}>
      {avatar && <AvatarImage src={avatar} />}
      <AvatarFallback
        className={cn(
          size === 'sm'
            ? 'text-xs'
            : size === 'xs'
              ? 'text-[8px]'
              : 'text-base',
          'bg-slate-200 text-slate-800'
        )}
      >
        {first_name?.at(0) ?? '🫣'}
      </AvatarFallback>
    </Avatar>
  );
}
