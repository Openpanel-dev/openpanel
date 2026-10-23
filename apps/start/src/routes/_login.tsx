import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AuthShell } from '@/components/auth/auth-shell';
import { isSignedIn } from '@/utils/route-session';

export const Route = createFileRoute('/_login')({
  beforeLoad: async ({ context }) => {
    if (await isSignedIn(context)) {
      throw redirect({ to: '/' });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <AuthShell>
      <Outlet />
    </AuthShell>
  );
}
