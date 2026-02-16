import type { IServiceDashboards } from '@openpanel/db';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellIcon,
  BookOpenIcon,
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
  TrendingUpDownIcon,
  UndoDotIcon,
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
import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';

interface SidebarProjectMenuProps {
  dashboards: IServiceDashboards;
}

export default function SidebarProjectMenu({
  dashboards,
}: SidebarProjectMenuProps) {
  return (
    <>
      <div className="mb-2 font-medium text-muted-foreground text-sm">
        Analytics
      </div>
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
      <SidebarLink href={'/pages'} icon={LayersIcon} label="Pages" />
      <SidebarLink href={'/realtime'} icon={Globe2Icon} label="Realtime" />
      <SidebarLink href={'/events'} icon={GanttChartIcon} label="Events" />
      <SidebarLink href={'/sessions'} icon={UsersIcon} label="Sessions" />
      <SidebarLink href={'/profiles'} icon={UsersIcon} label="Profiles" />
      <div className="mt-4 mb-2 font-medium text-muted-foreground text-sm">
        Manage
      </div>
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
      <SidebarLink href={'..'} icon={UndoDotIcon} label="Back to workspace" />
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
      setCurrentActionIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % ACTIONS.length;
        if (nextIndex === 0 && prevIndex !== 0) {
          clearInterval(interval);
          return 0;
        }
        return nextIndex;
      });
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
              <div className="relative flex h-5 items-center">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute whitespace-nowrap"
                    exit={{ y: -20, opacity: 0 }}
                    initial={{ y: 20, opacity: 0 }}
                    key={currentActionIndex}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 25,
                      duration: 0.3,
                    }}
                  >
                    {ACTIONS[currentActionIndex].label}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
            <ChevronDownIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {ACTIONS.map((action) => (
            <DropdownMenuItem
              className="cursor-pointer"
              key={action.label}
              onClick={action.onClick}
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
