import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import type { IServiceOrganization } from '@openpanel/db';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { MenuIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LogoSquare } from './logo';
import ProjectSelector from './project-selector';
import SettingsToggle from './settings-toggle';
import SidebarOrganizationMenu, {
  ActionCTAButton as ActionOrganizationCTAButton,
} from './sidebar-organization-menu';
import SidebarProjectMenu, {
  ActionCTAButton as ActionProjectCTAButton,
} from './sidebar-project-menu';
import { Button } from './ui/button';

export function Sidebar() {
  const { organizationId, projectId } = useParams({ strict: false });
  const trpc = useTRPC();

  // Get organizations data
  const { data: organizations = [] } = useQuery(
    trpc.organization.list.queryOptions(),
  );

  // Get projects data when we have an organization
  const { data: projects = [] } = useQuery({
    ...trpc.project.list.queryOptions({
      organizationId: organizationId || null,
    }),
    enabled: !!organizationId,
  });

  // Get dashboards data when we have a project
  const { data: dashboards = [] } = useQuery({
    ...trpc.dashboard.list.queryOptions({
      projectId: projectId || '',
    }),
    enabled: !!projectId,
  });

  if (projectId && organizationId) {
    return (
      <SidebarContainer organizations={organizations} projects={projects}>
        <ActionProjectCTAButton />
        <SidebarProjectMenu dashboards={dashboards} />
      </SidebarContainer>
    );
  }

  // Otherwise show the original sidebar structure
  return (
    <SidebarContainer organizations={organizations} projects={projects}>
      <ActionOrganizationCTAButton />
      <div className="mb-2 font-medium text-muted-foreground">Organization</div>
      <SidebarOrganizationMenu />
    </SidebarContainer>
  );
}

interface SidebarContainerProps {
  organizations: IServiceOrganization[];
  projects: Array<{ id: string; name: string; organizationId: string }>;
  children: React.ReactNode;
}

export function SidebarContainer({
  organizations,
  projects,
  children,
}: SidebarContainerProps) {
  const [active, setActive] = useState(false);
  const navigate = useNavigate();
  const { organizationId } = useAppParams();
  const organization = organizations.find((o) => o.id === organizationId);

  useEffect(() => {
    setActive(false);
  }, [navigate]);

  return (
    <>
      <button
        type="button"
        onClick={() => setActive(false)}
        className={cn(
          'fixed bottom-0 left-0 right-0 top-0 z-40 backdrop-blur-sm transition-opacity',
          active
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0',
        )}
      />
      <div
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-border bg-card transition-transform',
          '-translate-x-72 lg:-translate-x-0', // responsive
          active && 'translate-x-0', // force active on mobile
        )}
      >
        <div className="absolute -right-12 flex h-16 items-center lg:hidden">
          <Button
            size="icon"
            onClick={() => setActive((p) => !p)}
            variant={'outline'}
          >
            {active ? <XIcon size={16} /> : <MenuIcon size={16} />}
          </Button>
        </div>
        <div className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-4">
          <Link to="/">
            <LogoSquare className="max-h-8" />
          </Link>
          <ProjectSelector
            align="start"
            projects={projects}
            organizations={organizations}
          />
          <SettingsToggle />
        </div>
        <div className="flex flex-grow col gap-1 overflow-auto p-4">
          {/* <div className="col border rounded mb-2 divide-y">
            {(subscriptionProductId ===
              '036efa2a-b3b4-4c75-b24a-9cac6bb8893b' ||
              subscriptionProductId ===
                'a18b4bee-d3db-4404-be6f-fba2f042d9ed') && (
              <ProjectLink
                href={'/settings/organization?tab=billing'}
                className={cn(
                  'rounded p-2 row items-center gap-2 hover:bg-def-200 text-destructive',
                )}
              >
                <BanknoteIcon size={20} />
                <div className="flex-1 col gap-1">
                  <div className="font-medium">Free plan is removed</div>
                  <div className="text-sm opacity-80">
                    We've removed the free plan. You can upgrade to a paid plan
                    to continue using OpenPanel.
                  </div>
                </div>
              </ProjectLink>
            )}
            {import.meta.env.VITE_SELF_HOSTED === 'true' && (
              <a
                className="rounded p-2 row items-center gap-2 hover:bg-def-200"
                href="https://openpanel.dev/supporter"
              >
                <HeartHandshakeIcon size={20} />
                <div className="flex-1 col gap-1">
                  <div className="font-medium">Become a supporter</div>
                </div>
              </a>
            )}
            {isTrial && subscriptionEndsAt && (
              <ProjectLink
                href={'/settings/organization?tab=billing'}
                className={cn(
                  'rounded p-2 row items-center gap-2 hover:bg-def-200 text-destructive',
                )}
              >
                <BanknoteIcon size={20} />
                <div className="flex-1 col gap-1">
                  <div className="font-medium">
                    Free trial ends in{' '}
                    {differenceInDays(subscriptionEndsAt, new Date())} days
                  </div>
                </div>
              </ProjectLink>
            )}
            {isExpired && subscriptionEndsAt && (
              <ProjectLink
                href={'/settings/organization?tab=billing'}
                className={cn(
                  'rounded p-2 row gap-2 hover:bg-def-200 text-red-600',
                )}
              >
                <BanknoteIcon size={20} />
                <div className="flex-1 col gap-0.5">
                  <div className="font-medium">Subscription expired</div>
                  <div className="text-sm opacity-80">
                    You can still use OpenPanel but you won't have access to new
                    incoming data.
                  </div>
                </div>
              </ProjectLink>
            )}
            {isCanceled && subscriptionEndsAt && (
              <ProjectLink
                href={'/settings/organization?tab=billing'}
                className={cn(
                  'rounded p-2 row gap-2 hover:bg-def-200 text-red-600',
                )}
              >
                <BanknoteIcon size={20} />
                <div className="flex-1 col gap-0.5">
                  <div className="font-medium">Subscription canceled</div>
                  <div className="text-sm opacity-80">
                    {differenceInDays(new Date(), subscriptionEndsAt)} days ago
                  </div>
                </div>
              </ProjectLink>
            )}
            {isExceeded && subscriptionEndsAt && (
              <ProjectLink
                href={'/settings/organization?tab=billing'}
                className={cn(
                  'rounded p-2 row gap-2 hover:bg-def-200 text-destructive',
                )}
              >
                <BanknoteIcon size={20} />
                <div className="flex-1 col gap-0.5">
                  <div className="font-medium">Events limit exceeded</div>
                  <div className="text-sm opacity-80">
                    {formatNumber(subscriptionPeriodEventsCount)} /{' '}
                    {formatNumber(subscriptionPeriodEventsLimit)}
                  </div>
                </div>
              </ProjectLink>
            )}
            <ProjectLink
              href={'/chat'}
              className={cn(
                'rounded p-1.5 row gap-2 hover:bg-def-200 items-center transition-colors',
              )}
            >
              <SparklesIcon size={16} />
              <div className="flex-1">
                <div className="font-medium text-sm">Ask AI</div>
              </div>
              <CommandShortcut className="text-xs opacity-70">
                ⌘K
              </CommandShortcut>
            </ProjectLink>
            <ProjectLink
              href={'/reports'}
              className={cn(
                'rounded p-1.5 row gap-2 hover:bg-def-200 items-center transition-colors',
              )}
            >
              <ChartLineIcon size={16} />
              <div className="flex-1">
                <div className="font-medium text-sm">Create report</div>
              </div>
              <CommandShortcut className="text-xs opacity-70">
                ⌘J
              </CommandShortcut>
            </ProjectLink>
          </div> */}
          {children}
          {import.meta.env.VITE_SELF_HOSTED === 'true' && (
            <div className="mt-auto w-full ">
              <div className={cn('text-sm w-full text-center')}>
                Self-hosted instance
              </div>
            </div>
          )}
        </div>
        <div className="fixed bottom-0 left-0 right-0">
          <div className="h-8 w-full bg-gradient-to-t from-card to-card/0" />
        </div>
      </div>
    </>
  );
}
