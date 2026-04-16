import { usePageContextValue } from '@/contexts/page-context';
import { cn } from '@/utils/cn';
import {
  Building2Icon,
  GanttChartIcon,
  LayersIcon,
  LayoutPanelTopIcon,
  type LucideIcon,
  SearchIcon,
  TrendingUpDownIcon,
  UserCircleIcon,
  UsersIcon,
  WallpaperIcon,
} from 'lucide-react';

/**
 * Small banner shown at the top of the chat body explaining what
 * page context the AI is working with. Helps the user understand
 * "the assistant sees this page, this date range, these filters".
 *
 * Renders nothing when there's no useful context to surface.
 */
export function ChatContextWidget() {
  const ctx = usePageContextValue();
  if (!ctx) return null;

  const meta = PAGE_META[ctx.page];
  const Icon = meta?.icon ?? WallpaperIcon;
  const pageLabel = meta?.label ?? ctx.page;

  const chips: string[] = [];

  // Date range
  const range = ctx.filters?.range;
  if (range === 'custom' && ctx.filters?.startDate && ctx.filters?.endDate) {
    chips.push(`${ctx.filters.startDate} → ${ctx.filters.endDate}`);
  } else if (range) {
    chips.push(formatRange(range));
  }

  // Event-name filter
  if (ctx.filters?.eventNames && ctx.filters.eventNames.length > 0) {
    chips.push(`Events: ${ctx.filters.eventNames.join(', ')}`);
  }

  // Property filters — short form: "country=SE,US, device=mobile"
  if (ctx.filters?.eventFilters && ctx.filters.eventFilters.length > 0) {
    for (const f of ctx.filters.eventFilters) {
      const filter = f as {
        name?: string;
        operator?: string;
        value?: unknown[];
      };
      if (!filter.name) continue;
      const op = filter.operator && filter.operator !== 'is'
        ? ` ${filter.operator}`
        : '';
      const value = Array.isArray(filter.value)
        ? filter.value.join(', ')
        : '';
      chips.push(`${filter.name}${op}${value ? `: ${value}` : ''}`);
    }
  }

  // Entity ids on detail pages
  if (ctx.ids?.profileId) chips.push('Profile');
  if (ctx.ids?.sessionId) chips.push('Session');
  if (ctx.ids?.groupId) chips.push('Group');
  if (ctx.ids?.reportId) chips.push('Report');

  return (
    <div className="mx-3 mt-3 mb-1 rounded-lg border bg-card/95 px-3 py-2">
      <div className="flex items-start gap-2">
        <Icon className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1 col gap-1">
          <div className="text-sm text-muted-foreground">
            Assistant context
          </div>
          <div className="text-sm font-medium text-foreground/90">
            {pageLabel}
          </div>
          {chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {chips.map((chip) => (
                <ContextChip key={chip}>{chip}</ContextChip>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContextChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border bg-muted/40 px-1.5 py-0.5',
        'text-[11px] leading-none text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

const PAGE_META: Record<
  string,
  { label: string; icon: LucideIcon }
> = {
  overview: { label: 'Overview', icon: WallpaperIcon },
  insights: { label: 'Insights', icon: TrendingUpDownIcon },
  pages: { label: 'Pages', icon: LayersIcon },
  seo: { label: 'SEO', icon: SearchIcon },
  events: { label: 'Events', icon: GanttChartIcon },
  sessionDetail: { label: 'Session detail', icon: UsersIcon },
  profileDetail: { label: 'Profile detail', icon: UserCircleIcon },
  groupDetail: { label: 'Group detail', icon: Building2Icon },
  reportEditor: { label: 'Report editor', icon: LayoutPanelTopIcon },
};

function formatRange(range: string): string {
  switch (range) {
    case '30min':
      return 'Last 30 min';
    case 'lastHour':
      return 'Last hour';
    case 'today':
      return 'Today';
    case 'yesterday':
      return 'Yesterday';
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case '6m':
      return 'Last 6 months';
    case '12m':
      return 'Last 12 months';
    case 'monthToDate':
      return 'Month to date';
    case 'lastMonth':
      return 'Last month';
    case 'yearToDate':
      return 'Year to date';
    case 'lastYear':
      return 'Last year';
    default:
      return range;
  }
}
