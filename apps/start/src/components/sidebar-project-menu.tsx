import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
// import { pushModal } from '@/modals';
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
  ScanEyeIcon,
  SparklesIcon,
  UsersIcon,
  WallpaperIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SidebarLink } from './sidebar-link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

      {/* <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-muted-foreground">Your dashboards</div>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              // TODO: Add modal for creating dashboard
              // pushModal('AddDashboard')
              console.log('Add dashboard - modal not implemented yet');
            }}
          >
            <PlusIcon size={16} />
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {dashboards.map((item) => (
            <SidebarLink
              key={item.id}
              icon={LayoutPanelTopIcon}
              label={item.name}
              href={`/dashboards/${item.id}`}
            />
          ))}
        </div>
      </div> */}
    </>
  );
}

export function ActionCTAButton() {
  const { organizationId, projectId } = useAppParams();
  const navigate = useNavigate();

  const handleCreateReport = useCallback(() => {
    if (organizationId && projectId) {
      navigate({ to: `/${organizationId}/${projectId}/reports` });
    }
  }, [organizationId, projectId, navigate]);

  const handleCreateReference = useCallback(() => {
    // This would open the AddReference modal when modals are enabled
    console.log('Create reference clicked');
  }, []);

  const handleAskAI = useCallback(() => {
    if (organizationId && projectId) {
      navigate({ to: `/${organizationId}/${projectId}/chat` });
    }
  }, [organizationId, projectId, navigate]);

  const handleCreateDashboard = useCallback(() => {
    // This would open the AddDashboard modal when modals are enabled
    console.log('Create dashboard clicked');
  }, []);

  const handleCreateNotificationRule = useCallback(() => {
    // This would open the AddNotificationRule modal when modals are enabled
    console.log('Create notification rule clicked');
  }, []);

  const ACTIONS = [
    'Create report',
    'Create reference',
    'Ask AI',
    'Create dashboard',
    'Create notification',
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
                    {ACTIONS[currentActionIndex]}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
            <ChevronDownIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuItem
            onClick={handleCreateReport}
            className="cursor-pointer"
          >
            <ChartLineIcon className="mr-2 h-4 w-4" />
            Create report
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleCreateReference}
            className="cursor-pointer"
          >
            <BookOpenIcon className="mr-2 h-4 w-4" />
            Create reference
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleCreateDashboard}
            className="cursor-pointer"
          >
            <LayoutDashboardIcon className="mr-2 h-4 w-4" />
            Create dashboard
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleCreateNotificationRule}
            className="cursor-pointer"
          >
            <BellIcon className="mr-2 h-4 w-4" />
            Create notification rule
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleAskAI} className="cursor-pointer">
            <SparklesIcon className="mr-2 h-4 w-4" />
            Ask AI
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
