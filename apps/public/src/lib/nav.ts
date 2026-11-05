import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  BotIcon,
  CoinsIcon,
  FilterIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MessageSquareIcon,
  PlayCircleIcon,
  PlugIcon,
  RepeatIcon,
  Share2Icon,
  TargetIcon,
  UserIcon,
  ZapIcon,
} from 'lucide-react';

export interface NavFeature {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

// The four things the homepage leads with, in the same order.
export const PRIMARY_FEATURES: NavFeature[] = [
  {
    title: 'AI observability',
    description: 'Cost, tokens and latency for every model call.',
    href: '/features/ai-observability',
    icon: BotIcon,
  },
  {
    title: 'Ask your own AI',
    description: 'Pull the numbers from Claude, Cursor or your agent.',
    href: '/features/mcp',
    icon: MessageSquareIcon,
  },
  {
    title: 'Product analytics',
    description: 'Funnels, retention, cohorts and profiles.',
    href: '/features/funnels',
    icon: BarChart3Icon,
  },
  {
    title: 'Web analytics',
    description: 'Visitors, referrers and pages, without cookies.',
    href: '/features/web-analytics',
    icon: GlobeIcon,
  },
];

// Slugs match content/features/<slug>.json.
export const MORE_FEATURES: NavFeature[] = [
  {
    title: 'AI observability',
    description: 'What every model call costs, per user.',
    href: '/features/ai-observability',
    icon: BotIcon,
  },
  {
    title: 'Funnels',
    description: 'See where people drop off.',
    href: '/features/funnels',
    icon: FilterIcon,
  },
  {
    title: 'Retention',
    description: 'Who comes back, week by week.',
    href: '/features/retention',
    icon: RepeatIcon,
  },
  {
    title: 'Session replay',
    description: 'Watch what a user actually did.',
    href: '/features/session-replay',
    icon: PlayCircleIcon,
  },
  {
    title: 'Conversion',
    description: 'Track conversion rates over time.',
    href: '/features/conversion',
    icon: TargetIcon,
  },
  {
    title: 'Revenue tracking',
    description: 'Connect payments to the users behind them.',
    href: '/features/revenue-tracking',
    icon: CoinsIcon,
  },
  {
    title: 'Notifications',
    description: 'Get told when something happens.',
    href: '/features/notifications',
    icon: BellIcon,
  },
  {
    title: 'Charts',
    description: 'Any event, any chart, in real time.',
    href: '/features/data-visualization',
    icon: LayoutDashboardIcon,
  },
  {
    title: 'Sharing',
    description: 'Invite the team, share a dashboard.',
    href: '/features/share-and-collaborate',
    icon: Share2Icon,
  },
  {
    title: 'Integrations',
    description: 'Webhooks, Slack, Discord, Search Console.',
    href: '/features/integrations',
    icon: PlugIcon,
  },
  {
    title: 'Identify users',
    description: 'Tie events to real people.',
    href: '/features/identify-users',
    icon: UserIcon,
  },
  {
    title: 'Session tracking',
    description: 'Everything that happened in one visit.',
    href: '/features/session-tracking',
    icon: ActivityIcon,
  },
  {
    title: 'Event tracking',
    description: 'One line of code per event.',
    href: '/features/event-tracking',
    icon: ZapIcon,
  },
];

export const NAV_LINKS = [
  { text: 'Pricing', url: '/pricing' },
  { text: 'Docs', url: '/docs' },
  { text: 'Articles', url: '/articles' },
] as const;
