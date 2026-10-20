import type { IServiceOrganization } from '@openpanel/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from '@tanstack/react-router';
import {
  BookOpenIcon,
  HeartIcon,
  MenuIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useChatLaunch } from './chat/chat-launch';
import { FeedbackButton } from './feedback-button';
import { LogoSquare } from './logo';
import { ProfileToggle } from './profile-toggle';
import ProjectSelector from './project-selector';
import { SidebarSectionLabel } from './sidebar-link';
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
      <SidebarSectionLabel className="mt-2">Organization</SidebarSectionLabel>
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

const SIDEBAR_FOOTER_BUTTON = cn(
  'flex h-8 items-center justify-center gap-1.5 rounded-md font-medium text-muted-foreground text-xs',
  'transition-colors hover:bg-def-200 hover:text-foreground'
);

export function SidebarContainer({
  organizations,
  projects,
  children,
}: SidebarContainerProps) {
  const [active, setActive] = useState(false);
  const location = useLocation();
  const { isSelfHosted } = useAppContext();
  const { projectId } = useParams({ strict: false });
  const launchChat = useChatLaunch();

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
        <div className="flex h-16 shrink-0 items-center gap-2 px-3">
          <Link to="/">
            <LogoSquare className="max-h-8" />
          </Link>
          <ProjectSelector
            align="start"
            organizations={organizations}
            projects={projects}
          />
        </div>
        <div className="hide-scrollbar flex flex-1 flex-col gap-0.5 overflow-auto px-3 pb-4">
          {children}
        </div>
        <div className="relative shrink-0">
          <div className="pointer-events-none absolute right-0 bottom-full left-0 h-8 bg-gradient-to-t from-card to-card/0" />
          {isSelfHosted && (
            <a
              className={cn(
                'mx-3 mb-2 flex h-9 items-center gap-2.5 rounded-lg bg-def-200 px-2.5 font-medium text-sm',
                'text-foreground/75 transition-colors hover:bg-def-300 hover:text-foreground'
              )}
              href="https://openpanel.dev/supporter"
            >
              <HeartIcon className="size-[18px] shrink-0 text-rose-500" />
              <span className="flex-1 truncate">Support us</span>
              <span className="text-muted-foreground text-xs">
                Pay what you want
              </span>
            </a>
          )}
          <div className="flex items-center gap-0.5 border-border border-t px-3 py-2">
            <FeedbackButton className={cn(SIDEBAR_FOOTER_BUTTON, 'px-2')} />
            <a
              className={cn(SIDEBAR_FOOTER_BUTTON, 'px-2')}
              href="https://openpanel.dev/docs"
              rel="noopener noreferrer"
              target="_blank"
            >
              <BookOpenIcon className="size-4" />
              Docs
            </a>
            <div className="flex-1" />
            {projectId && (
              <button
                aria-label="Open AI chat"
                className={cn(SIDEBAR_FOOTER_BUTTON, 'size-8')}
                onClick={() => launchChat()}
                title="Open AI chat (⌘J)"
                type="button"
              >
                <SparklesIcon className="size-4" />
              </button>
            )}
            <ProfileToggle className={cn(SIDEBAR_FOOTER_BUTTON, 'size-8')} />
          </div>
        </div>
      </div>
    </>
  );
}
