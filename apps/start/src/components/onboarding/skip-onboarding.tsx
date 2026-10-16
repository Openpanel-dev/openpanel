import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { ChevronLastIcon, LogInIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useLogout } from '@/hooks/use-logout';
import { useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';

const PUBLIC_SEGMENTS = [['onboarding']];

export const SkipOnboarding = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const segments = location.pathname.split('/').filter(Boolean);
  const isPublic = PUBLIC_SEGMENTS.some((segment) =>
    segments.every((s, index) => s === segment[index])
  );
  const res = useQuery(
    trpc.onboarding.skipOnboardingCheck.queryOptions(undefined, {
      enabled: !isPublic,
    })
  );

  const logout = useLogout();
  useEffect(() => {
    res.refetch();
  }, [pathname]);

  // Do not show skip onboarding for the first step (register account)
  if (isPublic) {
    return (
      <Link
        className="flex items-center gap-2 text-muted-foreground"
        to="/login"
      >
        Login
        <LogInIcon size={16} />
      </Link>
    );
  }

  if (res.isLoading || res.isError) {
    return null;
  }

  return (
    <button
      className="flex items-center gap-2 text-muted-foreground"
      onClick={() => {
        if (res.data?.canSkip) {
          navigate({ to: '/' });
        } else {
          showConfirm({
            title: 'Skip onboarding?',
            text: 'Are you sure you want to skip onboarding? Since you do not have any projects, you will be logged out.',
            onConfirm() {
              logout.mutate();
            },
          });
        }
      }}
      type="button"
    >
      Skip onboarding
      <ChevronLastIcon size={16} />
    </button>
  );
};
