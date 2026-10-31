import {
  ActivityIcon,
  BellIcon,
  BotIcon,
  CalendarIcon,
  ChevronsUpDownIcon,
  CircleDotIcon,
  ClockIcon,
  FilterIcon,
  GlobeIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  type LucideIcon,
  MessageSquareIcon,
  PlugIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import { Pill } from './primitives';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';

export type DashboardPage =
  | 'overview'
  | 'reports'
  | 'ai'
  | 'chat'
  | 'realtime'
  | 'sessions';

const ANALYTICS_ITEMS: {
  id: DashboardPage | string;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboardIcon },
  { id: 'dashboards', label: 'Dashboards', icon: LayersIcon },
  { id: 'insights', label: 'Insights', icon: TrendingUpIcon },
  { id: 'ai', label: 'AI', icon: BotIcon },
  { id: 'pages', label: 'Pages', icon: GlobeIcon },
  { id: 'realtime', label: 'Realtime', icon: ActivityIcon },
  { id: 'events', label: 'Events', icon: CircleDotIcon },
  { id: 'sessions', label: 'Sessions', icon: ClockIcon },
  { id: 'profiles', label: 'Profiles', icon: UserIcon },
  { id: 'cohorts', label: 'Cohorts', icon: UsersIcon },
];

const MANAGE_ITEMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'notifications', label: 'Notifications', icon: BellIcon },
  { id: 'integrations', label: 'Integrations', icon: PlugIcon },
];

export function AppWindow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'window-shadow overflow-hidden rounded-xl border border-black/8 bg-white',
        className
      )}
    >
      {children}
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  shortcut,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  shortcut?: string;
}) {
  return (
    <div
      className={cn(
        'row items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px]',
        active
          ? 'bg-neutral-100 font-medium text-neutral-900'
          : 'text-neutral-600'
      )}
    >
      <Icon className="size-3.5 shrink-0 text-neutral-500" />
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="rounded border border-neutral-200 px-1 font-mono text-[9px] text-neutral-400">
          {shortcut}
        </span>
      )}
    </div>
  );
}

export function Sidebar({
  project,
  active,
}: {
  project: string;
  active: DashboardPage;
}) {
  return (
    <aside className="col w-[190px] shrink-0 gap-4 border-neutral-200 border-r bg-white p-3">
      <div className="row items-center gap-2">
        <span className="center-center size-8 rounded-lg bg-blue-600">
          <Logo className="h-3.5 w-auto text-white" />
        </span>
        <span className="row flex-1 items-center justify-between rounded-md border border-neutral-200 px-2 py-1.5 text-[12px]">
          <span className="font-medium">{project}</span>
          <ChevronsUpDownIcon className="size-3 text-neutral-400" />
        </span>
      </div>
      <div className="col gap-0.5">
        <SidebarItem
          active={active === 'reports'}
          icon={LineChartIcon}
          label="Report"
          shortcut="⌘I"
        />
        <SidebarItem
          active={active === 'chat'}
          icon={MessageSquareIcon}
          label="Chat"
          shortcut="⌘J"
        />
      </div>
      <div className="col gap-0.5">
        <span className="px-2.5 pb-1 text-[11px] text-neutral-400">
          Analytics
        </span>
        {ANALYTICS_ITEMS.map((item) => (
          <SidebarItem
            active={item.id === active}
            icon={item.icon}
            key={item.id}
            label={item.label}
          />
        ))}
      </div>
      <div className="col gap-0.5">
        <span className="px-2.5 pb-1 text-[11px] text-neutral-400">Manage</span>
        {MANAGE_ITEMS.map((item) => (
          <SidebarItem icon={item.icon} key={item.id} label={item.label} />
        ))}
      </div>
    </aside>
  );
}

export function Toolbar({
  range = 'Last 7 days',
  withAsk = true,
}: {
  range?: string;
  withAsk?: boolean;
}) {
  return (
    <div className="row items-center gap-2">
      <Pill>
        <CalendarIcon className="size-3" />
        {range}
      </Pill>
      <Pill>
        <ClockIcon className="size-3" />
        Day
      </Pill>
      <Pill>
        <FilterIcon className="size-3" />
        Filters
      </Pill>
      {withAsk && (
        <span className="row flex-1 items-center gap-2 rounded-md bg-neutral-100 px-2.5 py-1.5 text-[12px] text-neutral-500">
          <SparklesIcon className="size-3" />
          Try: "last 7 days, mobile only"
        </span>
      )}
      {!withAsk && <span className="flex-1" />}
      <Pill>
        <SearchIcon className="size-3" />
        Search
      </Pill>
    </div>
  );
}

export function DashboardShell({
  project,
  active,
  children,
  toolbar,
  className,
}: {
  project: string;
  active: DashboardPage;
  children: React.ReactNode;
  toolbar?: React.ReactNode;
  className?: string;
}) {
  return (
    <AppWindow className={className}>
      <div className="row bg-neutral-50/60 text-left text-neutral-900">
        <Sidebar active={active} project={project} />
        <div className="@container col min-w-0 flex-1 gap-3 p-4">
          {toolbar}
          {children}
        </div>
      </div>
    </AppWindow>
  );
}
