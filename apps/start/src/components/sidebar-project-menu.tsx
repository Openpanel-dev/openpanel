import type { IServiceDashboards } from '@openpanel/core';
import { useNavigate } from '@tanstack/react-router';
import {
  BellIcon,
  BotIcon,
  Building2Icon,
  ChartLineIcon,
  CogIcon,
  GanttChartIcon,
  Globe2Icon,
  GridIcon,
  LayersIcon,
  LayoutPanelTopIcon,
  SearchIcon,
  SparklesIcon,
  TargetIcon,
  TrendingUpDownIcon,
  UndoDotIcon,
  UserCircleIcon,
  UsersIcon,
  WallpaperIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import {
  SidebarIcon,
  SidebarLink,
  SidebarSectionLabel,
  sidebarItemClassName,
} from './sidebar-link';
import { useChatLaunch } from '@/components/chat/chat-launch';
import { ProjectLink } from '@/components/links';
import { useAppParams } from '@/hooks/use-app-params';
import { cn } from '@/utils/cn';

interface SidebarProjectMenuProps {
  dashboards: IServiceDashboards;
}

export default function SidebarProjectMenu({
  dashboards,
}: SidebarProjectMenuProps) {
  return (
    <>
      <SidebarReportLink />
      <SidebarChatButton />
      <SidebarSectionLabel>Analytics</SidebarSectionLabel>
      <SidebarLink href={'/'} icon={WallpaperIcon} label="Overview" />
      <SidebarLink
        href={'/dashboards'}
        icon={LayoutPanelTopIcon}
        label="Dashboards"
      />
      <SidebarLink
        href={'/insights'}
        icon={TrendingUpDownIcon}
        label="Insights"
      />
      <SidebarLink exact={false} href={'/ai'} icon={BotIcon} label="AI" />
      <SidebarLink href={'/pages'} icon={LayersIcon} label="Pages" />
      <SidebarLink href={'/seo'} icon={SearchIcon} label="SEO" />
      <SidebarLink href={'/realtime'} icon={Globe2Icon} label="Realtime" />
      <SidebarLink href={'/events'} icon={GanttChartIcon} label="Events" />
      <SidebarLink href={'/sessions'} icon={UsersIcon} label="Sessions" />
      <SidebarLink href={'/profiles'} icon={UserCircleIcon} label="Profiles" />
      <SidebarLink href={'/groups'} icon={Building2Icon} label="Groups" />
      <SidebarLink href={'/cohorts'} icon={TargetIcon} label="Cohorts" />
      <SidebarSectionLabel>Manage</SidebarSectionLabel>
      <SidebarLink
        exact={false}
        href={'/settings'}
        icon={CogIcon}
        label="Settings"
      />
      <SidebarLink href={'/references'} icon={GridIcon} label="References" />
      <SidebarLink
        exact={false}
        href={'/notifications'}
        icon={BellIcon}
        label="Notifications"
      />
      <SidebarLink
        exact={false}
        href={'/integrations'}
        icon={WorkflowIcon}
        label="Integrations"
      />
      <SidebarLink href={'..'} icon={UndoDotIcon} label="Back to workspace" />
    </>
  );
}

const REPORT_SHORTCUT_KEY = 'i';

function isShortcut(event: KeyboardEvent, key: string) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === key;
}

function SidebarKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-2xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
      {children}
    </kbd>
  );
}

function SidebarReportLink() {
  const navigate = useNavigate();
  const { organizationId, projectId } = useAppParams();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isShortcut(event, REPORT_SHORTCUT_KEY)) {
        return;
      }
      event.preventDefault();
      navigate({
        to: '/$organizationId/$projectId/reports',
        params: { organizationId, projectId },
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, organizationId, projectId]);

  return (
    <ProjectLink className={sidebarItemClassName} href="/reports">
      <SidebarIcon icon={ChartLineIcon} />
      <div className="flex-1 truncate">Report</div>
      <SidebarKbd>⌘I</SidebarKbd>
    </ProjectLink>
  );
}

function SidebarChatButton() {
  const launchChat = useChatLaunch();
  return (
    <button
      className={cn(sidebarItemClassName, 'w-full text-left')}
      onClick={() => launchChat()}
      type="button"
    >
      <SidebarIcon icon={SparklesIcon} />
      <div className="flex-1 truncate">Chat</div>
      <SidebarKbd>⌘J</SidebarKbd>
    </button>
  );
}
