import type { IServiceOrganization } from '@openpanel/db';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from '@tanstack/react-router';
import { MenuIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FeedbackButton } from './feedback-button';
import { LogoSquare } from './logo';
import { ProfileToggle } from './profile-toggle';
import ProjectSelector from './project-selector';
import SidebarOrganizationMenu, {
  ActionCTAButton as ActionOrganizationCTAButton,
} from './sidebar-organization-menu';
import SidebarProjectMenu, {
  ActionCTAButton as ActionProjectCTAButton,
} from './sidebar-project-menu';
import { Button } from './ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

export function Sidebar() {
  const { organizationId, projectId } = useParams({ strict: false });
  const trpc = useTRPC();

  // Get organizations data
  const { data: organizations = [] } = useQuery(
    trpc.organization.list.queryOptions()
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
  const location = useLocation();
  const { isSelfHosted } = useAppContext();

  useEffect(() => {
    setActive(false);
  }, [location]);

  return (
    <>
      <button
        className={cn(
          'fixed top-0 right-0 bottom-0 left-0 z-40 backdrop-blur-sm transition-opacity',
          active
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
        onClick={() => setActive(false)}
        type="button"
      />
      <div
        className={cn(
          'fixed top-0 left-0 z-40 flex h-screen w-72 flex-col border-border border-r bg-card transition-transform',
          '-translate-x-72 lg:-translate-x-0', // responsive
          active && 'translate-x-0' // force active on mobile
        )}
      >
        <div className="absolute -right-12 flex h-16 items-center lg:hidden">
          <Button
            onClick={() => setActive((p) => !p)}
            size="icon"
            variant={'outline'}
          >
            {active ? <XIcon size={16} /> : <MenuIcon size={16} />}
          </Button>
        </div>
        <div className="flex h-16 shrink-0 items-center gap-2 border-border border-b px-4">
          <Link to="/">
            <LogoSquare className="max-h-8" />
          </Link>
          <ProjectSelector
            align="start"
            organizations={organizations}
            projects={projects}
          />
        </div>
        <div
          className={cn([
            'hide-scrollbar flex-1 overflow-auto p-4',
            "[&_a[data-status='active']]:bg-def-200",
          ])}
        >
          {children}
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute right-0 bottom-full left-0 h-8 bg-gradient-to-t from-card to-card/0" />
          <div className="border-border border-t bg-card">
            <div className="flex items-center">
              <FeedbackButton className="h-12 flex-1 whitespace-nowrap rounded-none border-border border-r px-4 text-muted-foreground outline-0 hover:bg-accent hover:text-accent-foreground" />
              <a
                className="flex h-12 flex-1 items-center justify-center gap-2 border-border border-r font-medium text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                href="https://openpanel.dev/docs"
                rel="noopener noreferrer"
                target="_blank"
              >
                Docs
              </a>
              <ProfileToggle className="h-12 flex-1 rounded-none hover:bg-accent hover:text-accent-foreground" />
            </div>
            {isSelfHosted && (
              <a
                className="center-center flex h-12 cursor-pointer gap-2 border-border border-t px-4 font-medium text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                href="https://openpanel.dev/supporter"
              >
                <span>Support Us</span>
                <span>Pay What You Want</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
