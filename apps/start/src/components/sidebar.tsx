import { useAppContext } from '@/hooks/use-app-context';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import type { IServiceOrganization } from '@openpanel/db';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from '@tanstack/react-router';
import {
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { FeedbackButton } from './feedback-button';
import { LogoSquare } from './logo';
import { ProfileToggle } from './profile-toggle';
import ProjectSelector from './project-selector';
import { SB_HIDE } from './sidebar-collapse';
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
      <div className={cn('mb-2 font-medium text-muted-foreground', SB_HIDE)}>
        Organization
      </div>
      <SidebarOrganizationMenu
        organization={organizations.find((o) => o.id === organizationId)!}
      />
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
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const location = useLocation();
  const { isSelfHosted } = useAppContext();

  useEffect(() => {
    setActive(false);
  }, [location]);

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
          'group/sidebar fixed left-0 top-0 z-40 flex h-screen w-52 flex-col border-r border-border bg-card transition-transform duration-150',
          '-translate-x-52 lg:-translate-x-0', // responsive
          active && 'translate-x-0', // force active on mobile
          'data-[collapsed=true]:lg:w-16', // icon rail (lg+)
        )}
        data-collapsed={collapsed ? 'true' : 'false'}
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
        <div
          className={cn(
            'flex h-16 shrink-0 items-center gap-2 border-b border-border px-4',
            'group-data-[collapsed=true]/sidebar:lg:justify-center group-data-[collapsed=true]/sidebar:lg:px-0',
          )}
        >
          <Link to="/" className="shrink-0">
            <LogoSquare className="max-h-8" />
          </Link>
          <div className={cn('min-w-0 flex-1', SB_HIDE)}>
            <ProjectSelector
              align="start"
              projects={projects}
              organizations={organizations}
            />
          </div>
        </div>
        <div
          className={cn([
            'flex flex-grow col gap-1 overflow-auto p-4',
            "[&_a[data-status='active']]:bg-def-200",
          ])}
        >
          {children}

          <div className="mt-auto w-full pt-6">
            <div
              className={cn(
                'row gap-2 justify-between',
                'group-data-[collapsed=true]/sidebar:lg:justify-center',
              )}
            >
              <div className={SB_HIDE}>
                <FeedbackButton />
              </div>
              <ProfileToggle />
            </div>
            {isSelfHosted && (
              <a
                href="https://openpanel.dev/supporter"
                className={cn(
                  'text-center text-sm w-full mt-2 border rounded p-2 font-medium block hover:underline hover:text-primary outline-none',
                  SB_HIDE,
                )}
              >
                Self-hosted instance, support us!
              </a>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'mt-2 hidden w-full lg:flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-muted-foreground transition-all hover:bg-def-200',
              )}
            >
              <PanelLeftCloseIcon
                size={18}
                className={cn('shrink-0', SB_HIDE)}
              />
              <PanelLeftOpenIcon
                size={18}
                className="hidden shrink-0 group-data-[collapsed=true]/sidebar:lg:block"
              />
              <span className={SB_HIDE}>Collapse</span>
            </button>
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 pointer-events-none">
          <div className="h-8 w-full bg-gradient-to-t from-card to-card/0" />
        </div>
      </div>
    </>
  );
}
