'use client';

import { useEffect } from 'react';
import { useAppParams } from '@/hooks/useAppParams';
import { cn } from '@/utils/cn';
import { useUser } from '@clerk/nextjs';
import {
  BookmarkIcon,
  BuildingIcon,
  CogIcon,
  GanttChartIcon,
  Globe2Icon,
  KeySquareIcon,
  LayoutPanelTopIcon,
  UserIcon,
  UserSearchIcon,
  UsersIcon,
  WallpaperIcon,
  WarehouseIcon,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { IServiceDashboards } from '@openpanel/db';

function LinkWithIcon({
  href,
  icon: Icon,
  label,
  active: overrideActive,
  className,
}: {
  href: string;
  icon: React.ElementType<LucideProps>;
  label: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const active = overrideActive || href === pathname;
  return (
    <Link
      className={cn(
        'text-text flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium leading-none transition-all transition-colors hover:bg-slate-100',
        active && 'bg-slate-100',
        className
      )}
      href={href}
    >
      <Icon size={20} />
      <div className="flex-1">{label}</div>
    </Link>
  );
}

interface LayoutMenuProps {
  dashboards: IServiceDashboards;
}
export default function LayoutMenu({ dashboards }: LayoutMenuProps) {
  const { user } = useUser();

  const pathname = usePathname();
  const params = useAppParams();
  const hasProjectId =
    params.projectId &&
    params.projectId !== 'null' &&
    params.projectId !== 'undefined';
  const projectId = hasProjectId
    ? params.projectId
    : (user?.unsafeMetadata.projectId as string);

  useEffect(() => {
    if (hasProjectId) {
      user?.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          projectId: params.projectId,
        },
      });
    }
  }, [params.projectId, hasProjectId]);

  return (
    <>
      <LinkWithIcon
        icon={WallpaperIcon}
        label="Overview"
        href={`/${params.organizationSlug}/${projectId}`}
      />
      <LinkWithIcon
        icon={LayoutPanelTopIcon}
        label="Dashboards"
        href={`/${params.organizationSlug}/${projectId}/dashboards`}
      />
      <LinkWithIcon
        icon={Globe2Icon}
        label="Realtime"
        href={`/${params.organizationSlug}/${projectId}/realtime`}
      />
      <LinkWithIcon
        icon={GanttChartIcon}
        label="Events"
        href={`/${params.organizationSlug}/${projectId}/events`}
      />
      <LinkWithIcon
        icon={UserSearchIcon}
        label="Retention"
        href={`/${params.organizationSlug}/${projectId}/retention`}
      />
      <LinkWithIcon
        icon={UsersIcon}
        label="Profiles"
        href={`/${params.organizationSlug}/${projectId}/profiles`}
      />
      <LinkWithIcon
        icon={CogIcon}
        label="Settings"
        href={`/${params.organizationSlug}/${projectId}/settings/organization`}
      />
      {pathname?.includes('/settings/') && (
        <div className="flex flex-col gap-1 pl-7">
          <LinkWithIcon
            icon={BuildingIcon}
            label="Organization"
            href={`/${params.organizationSlug}/${projectId}/settings/organization`}
          />
          <LinkWithIcon
            icon={WarehouseIcon}
            label="Projects"
            href={`/${params.organizationSlug}/${projectId}/settings/projects`}
          />
          <LinkWithIcon
            icon={UserIcon}
            label="Profile (yours)"
            href={`/${params.organizationSlug}/${projectId}/settings/profile`}
          />
          <LinkWithIcon
            icon={BookmarkIcon}
            label="References"
            href={`/${params.organizationSlug}/${projectId}/settings/references`}
          />
        </div>
      )}
      {dashboards.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 text-sm font-medium">Your dashboards</div>
          <div className="flex flex-col gap-2">
            {dashboards.map((item) => (
              <LinkWithIcon
                key={item.id}
                icon={LayoutPanelTopIcon}
                label={
                  <div className="flex items-center justify-between gap-0.5">
                    <span>{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.project.name}
                    </span>
                  </div>
                }
                href={`/${item.organizationSlug}/${item.projectId}/dashboards/${item.id}`}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
