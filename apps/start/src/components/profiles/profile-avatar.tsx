import { Avatar, AvatarFallback, AvatarImage } from '@/components/facehash';
import { cn } from '@/utils/cn';
import { type GetProfileNameProps, getProfileName } from '@/utils/getters';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

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
  const name = getProfileName({ ...profile, isExternal: true });
  const isValidAvatar = avatar?.startsWith('http');

  return (
    <Avatar className={cn(variants({ className, size }), className)}>
      {isValidAvatar && <AvatarImage src={avatar} className="rounded-full" />}
      <AvatarFallback
        name={name ?? 'Unknown'}
        facehash
        className="rounded-full"
      />
    </Avatar>
  );
}
