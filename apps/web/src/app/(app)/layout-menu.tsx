'use client';

import type { IServiceRecentDashboards } from '@/server/services/dashboard.service';
import {
  BuildingIcon,
  CogIcon,
  GanttChartIcon,
  KeySquareIcon,
  LayoutPanelTopIcon,
  UserIcon,
  UsersIcon,
  WarehouseIcon,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

function LinkWithIcon({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType<LucideProps>;
  label: React.ReactNode;
}) {
  return (
    <Link
      className="flex gap-2 items-center px-3 py-3 transition-colors hover:bg-slate-100 leading-none rounded-lg"
      href={href}
    >
      <Icon size={20} />
      {label}
    </Link>
  );
}

interface LayoutMenuProps {
  recentDashboards: IServiceRecentDashboards;
  fallbackProjectId: string | null;
}
export default function LayoutMenu({
  recentDashboards,
  fallbackProjectId,
}: LayoutMenuProps) {
  const pathname = usePathname();
  const params = useParams();
  const projectId = (
    !params.projectId || params.projectId === 'undefined'
      ? fallbackProjectId
      : params.projectId
  ) as string | null;

  return (
    <>
      <LinkWithIcon
        icon={LayoutPanelTopIcon}
        label="Dashboards"
        href={`/${params.organizationId}/${projectId}`}
      />
      <LinkWithIcon
        icon={GanttChartIcon}
        label="Events"
        href={`/${params.organizationId}/${projectId}/events`}
      />
      <LinkWithIcon
        icon={UsersIcon}
        label="Profiles"
        href={`/${params.organizationId}/${projectId}/profiles`}
      />
      <LinkWithIcon
        icon={CogIcon}
        label="Settings"
        href={`/${params.organizationId}/settings/organization`}
      />
      {pathname.includes('/settings/') && (
        <div className="pl-7">
          <LinkWithIcon
            icon={BuildingIcon}
            label="Organization"
            href={`/${params.organizationId}/settings/organization`}
          />
          <LinkWithIcon
            icon={WarehouseIcon}
            label="Projects"
            href={`/${params.organizationId}/settings/projects`}
          />
          <LinkWithIcon
            icon={KeySquareIcon}
            label="Clients"
            href={`/${params.organizationId}/settings/clients`}
          />
          <LinkWithIcon
            icon={UserIcon}
            label="Profile (yours)"
            href={`/${params.organizationId}/settings/profile`}
          />
        </div>
      )}
      {recentDashboards.length > 0 && (
        <div className="mt-8">
          <div className="font-medium mb-2">Recent dashboards</div>
          {recentDashboards.map((item) => (
            <LinkWithIcon
              key={item.id}
              icon={LayoutPanelTopIcon}
              label={
                <div className="flex flex-col">
                  <span>{item.dashboard.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.project.name}
                  </span>
                </div>
              }
              href={`/${item.organization_id}/${item.project_id}/${item.dashboard_id}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
