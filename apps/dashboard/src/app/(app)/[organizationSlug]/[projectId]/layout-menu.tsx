'use client';

import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import {
  ChartLineIcon,
  GanttChartIcon,
  Globe2Icon,
  LayersIcon,
  LayoutPanelTopIcon,
  PlusIcon,
  ScanEyeIcon,
  UsersIcon,
  WallpaperIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { ProjectLink } from '@/components/links';
import type { IServiceDashboards } from '@openpanel/db';

function LinkWithIcon({
  href,
  icon: Icon,
  label,
  active: overrideActive,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const active = overrideActive || href === pathname;
  return (
    <ProjectLink
      className={cn(
        'text-text flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200',
        active && 'bg-def-200',
        className,
      )}
      href={href}
    >
      <Icon size={20} />
      <div className="flex-1">{label}</div>
    </ProjectLink>
  );
}

interface LayoutMenuProps {
  dashboards: IServiceDashboards;
}
export default function LayoutMenu({ dashboards }: LayoutMenuProps) {
  return (
    <>
      <ProjectLink
        href={'/reports'}
        className={cn(
          'border rounded p-2 row items-center gap-2 hover:bg-def-200 mb-4',
        )}
      >
        <ChartLineIcon size={20} />
        <div className="flex-1 col gap-1">
          <div className="font-medium">Create report</div>
          <div className="text-sm text-muted-foreground">
            Visualize your events
          </div>
        </div>
        <PlusIcon size={16} className="text-muted-foreground" />
      </ProjectLink>
      <LinkWithIcon icon={WallpaperIcon} label="Overview" href={'/'} />
      <LinkWithIcon
        icon={LayoutPanelTopIcon}
        label="Dashboards"
        href={'/dashboards'}
      />
      <LinkWithIcon icon={LayersIcon} label="Pages" href={'/pages'} />
      <LinkWithIcon icon={Globe2Icon} label="Realtime" href={'/realtime'} />
      <LinkWithIcon icon={GanttChartIcon} label="Events" href={'/events'} />
      <LinkWithIcon icon={UsersIcon} label="Profiles" href={'/profiles'} />
      <LinkWithIcon icon={ScanEyeIcon} label="Retention" href={'/retention'} />
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-muted-foreground">Your dashboards</div>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => pushModal('AddDashboard')}
          >
            <PlusIcon size={16} />
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {dashboards.map((item) => (
            <LinkWithIcon
              key={item.id}
              icon={LayoutPanelTopIcon}
              label={item.name}
              href={`/dashboards/${item.id}`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
