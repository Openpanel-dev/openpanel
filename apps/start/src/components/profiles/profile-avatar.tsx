import { Avatar, AvatarFallback, AvatarImage } from '@/components/facehash';
import { cn } from '@/utils/cn';
import { type GetProfileNameProps, getProfileName } from '@/utils/getters';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { useEffect, useState } from 'react';

interface ProfileAvatarProps
  extends VariantProps<typeof variants>,
    GetProfileNameProps {
  className?: string;
  avatar?: string;
  email?: string;
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

/**
 * Hash the lowercased email and ask Gravatar for the user's photo.
 * `d=404` makes Gravatar return a 404 when there's no match — the
 * <AvatarImage> then fails to load and we fall back to the facehash.
 *
 * Gravatar's original API used MD5; they now accept SHA-256 which we
 * can compute in the browser via WebCrypto without adding a
 * dependency.
 */
function useGravatarUrl(email: string | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (
      !email ||
      typeof crypto === 'undefined' ||
      !crypto.subtle ||
      !email.includes('@')
    ) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const trimmed = email.trim().toLowerCase();
        const encoded = new TextEncoder().encode(trimmed);
        const hash = await crypto.subtle.digest('SHA-256', encoded);
        const hex = Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (!cancelled) {
          // s=128 is plenty for even the large avatar variant.
          setUrl(`https://gravatar.com/avatar/${hex}?d=404&s=128`);
        }
      } catch {
        // Either crypto.subtle barfed or we're in a weird runtime —
        // either way fall back silently to facehash.
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);
  return url;
}

export function ProfileAvatar({
  avatar,
  email,
  className,
  size,
  ...profile
}: ProfileAvatarProps) {
  const name = getProfileName({ ...profile, isExternal: true });
  const isValidAvatar = avatar?.startsWith('http');
  const gravatarUrl = useGravatarUrl(isValidAvatar ? null : email ?? null);
  // Prefer an explicit avatar set on the Pin Drop profile; otherwise
  // try Gravatar via the email address (Gmail-style lookup); finally
  // fall back to the deterministic facehash so every profile still
  // renders something recognisable.
  const src = isValidAvatar ? avatar : gravatarUrl;

  return (
    <Avatar className={cn(variants({ className, size }), className)}>
      {src && <AvatarImage src={src} className="rounded-full" />}
      <AvatarFallback
        name={name ?? 'Unknown'}
        facehash
        className="rounded-full"
      />
    </Avatar>
  );
}
