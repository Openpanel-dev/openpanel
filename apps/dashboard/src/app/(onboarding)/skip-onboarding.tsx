'use client';

import { useEffect } from 'react';
import { showConfirm } from '@/modals';
import { api } from '@/trpc/client';
import { useAuth } from '@clerk/nextjs';
import { ChevronLastIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

const SkipOnboarding = () => {
  const router = useRouter();
  const pathname = usePathname();
  const res = api.onboarding.skipOnboardingCheck.useQuery();
  const auth = useAuth();
  useEffect(() => {
    res.refetch();
  }, [pathname]);

  console.log(res.data);

  if (!pathname.startsWith('/onboarding')) return null;
  return (
    <button
      onClick={() => {
        if (res.data?.canSkip && res.data?.url) {
          router.push(res.data.url);
        } else {
          showConfirm({
            title: 'Skip onboarding?',
            text: 'Are you sure you want to skip onboarding? Since you do not have any projects, you will be logged out.',
            onConfirm() {
              auth.signOut();
            },
          });
        }
      }}
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      Skip onboarding
      <ChevronLastIcon size={16} />
    </button>
  );
};

export default SkipOnboarding;
