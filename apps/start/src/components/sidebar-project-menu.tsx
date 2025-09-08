import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import type { IServiceDashboards } from '@openpanel/db';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellIcon,
  BookOpenIcon,
  BuildingIcon,
  ChartLineIcon,
  ChevronDownIcon,
  CogIcon,
  GanttChartIcon,
  Globe2Icon,
  GridIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LayoutPanelTopIcon,
  PlusIcon,
  SparklesIcon,
  UsersIcon,
  WallpaperIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { SidebarLink } from './sidebar-link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface SidebarProjectMenuProps {
  dashboards: IServiceDashboards;
}

export default function SidebarProjectMenu({
  dashboards,
}: SidebarProjectMenuProps) {
  return (
    <>
      <div className="mb-2 font-medium text-muted-foreground">Insights</div>
      <SidebarLink icon={WallpaperIcon} label="Overview" href={'/'} />
      <SidebarLink
        icon={LayoutPanelTopIcon}
        label="Dashboards"
        href={'/dashboards'}
      />
      <SidebarLink icon={LayersIcon} label="Pages" href={'/pages'} />
      <SidebarLink icon={Globe2Icon} label="Realtime" href={'/realtime'} />
      <SidebarLink icon={GanttChartIcon} label="Events" href={'/events'} />
      <SidebarLink icon={UsersIcon} label="Sessions" href={'/sessions'} />
      <SidebarLink icon={UsersIcon} label="Profiles" href={'/profiles'} />
      <div className="mt-4 mb-2 font-medium text-muted-foreground">Manage</div>
      <SidebarLink icon={CogIcon} label="Settings" href={'/settings'} />
      <SidebarLink icon={GridIcon} label="References" href={'/references'} />
      <SidebarLink
        icon={BellIcon}
        label="Notifications"
        href={'/notifications'}
      />
      <SidebarLink icon={BuildingIcon} label="Workspace" href={'..'} />
    </>
  );
}

export function ActionCTAButton() {
  const navigate = useNavigate();

  const ACTIONS = [
    {
      label: 'Create report',
      icon: ChartLineIcon,
      onClick: () =>
        navigate({
          to: '/$organizationId/$projectId/reports',
          from: '/$organizationId/$projectId',
        }),
    },
    {
      label: 'Create reference',
      icon: BookOpenIcon,
      onClick: () => pushModal('AddReference'),
    },
    {
      label: 'Ask AI',
      icon: SparklesIcon,
      onClick: () =>
        navigate({
          to: '/$organizationId/$projectId/chat',
          from: '/$organizationId/$projectId',
        }),
    },
    {
      label: 'Create dashboard',
      icon: LayoutDashboardIcon,
      onClick: () => pushModal('AddDashboard'),
    },
    {
      label: 'Create notification rule',
      icon: BellIcon,
      onClick: () =>
        navigate({
          to: '/$organizationId/$projectId/notifications/rules',
          from: '/$organizationId/$projectId',
        }),
    },
  ];

  const [currentActionIndex, setCurrentActionIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentActionIndex((prevIndex) => (prevIndex + 1) % ACTIONS.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mb-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="w-full justify-between" size="default">
            <div className="flex items-center gap-2">
              <PlusIcon size={16} />
              <div className="relative h-5 flex items-center">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={currentActionIndex}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 25,
                      duration: 0.3,
                    }}
                    className="absolute whitespace-nowrap"
                  >
                    {ACTIONS[currentActionIndex].label}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
            <ChevronDownIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          {ACTIONS.map((action) => (
            <DropdownMenuItem
              onClick={action.onClick}
              className="cursor-pointer"
              key={action.label}
            >
              <action.icon className="mr-2 h-4 w-4" />
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
