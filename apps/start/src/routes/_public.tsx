import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AuthShell } from '@/components/auth/auth-shell';

export const Route = createFileRoute('/_public')({
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <AuthShell>
      <Outlet />
    </AuthShell>
  );
}
