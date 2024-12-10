'use client';

import { useLogout } from '@/hooks/useLogout';
import { showConfirm } from '@/modals';
import { api } from '@/trpc/client';
import { ChevronLastIcon, LogInIcon } from 'lucide-react';
import Link from 'next/link';
import {
  usePathname,
  useRouter,
  useSelectedLayoutSegments,
} from 'next/navigation';
import { useEffect } from 'react';

const PUBLIC_SEGMENTS = [['onboarding']];

const SkipOnboarding = () => {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSelectedLayoutSegments();
  const isPublic = PUBLIC_SEGMENTS.some((segment) =>
    segments.every((s, index) => s === segment[index]),
  );
  const res = api.onboarding.skipOnboardingCheck.useQuery(undefined, {
    enabled: !isPublic,
  });

  const logout = useLogout();
  useEffect(() => {
    res.refetch();
  }, [pathname]);

  // Do not show skip onboarding for the first step (register account)
  if (isPublic) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-2  text-muted-foreground"
      >
        Login
        <LogInIcon size={16} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (res.data?.canSkip && res.data?.url) {
          router.push(res.data.url);
        } else {
          showConfirm({
            title: 'Skip onboarding?',
            text: 'Are you sure you want to skip onboarding? Since you do not have any projects, you will be logged out.',
            onConfirm() {
              logout();
            },
          });
        }
      }}
      className="flex items-center gap-2  text-muted-foreground"
    >
      Skip onboarding
      <ChevronLastIcon size={16} />
    </button>
  );
};

export default SkipOnboarding;
