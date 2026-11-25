import type { ChatLaunchHint } from '@openpanel/core/modules/assistant/assistant.constants';
import {
  ActivityIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  ChartBarIcon,
  ChartLineIcon,
  CodeIcon,
  CompassIcon,
  ExternalLinkIcon,
  FilterIcon,
  GitForkIcon,
  GlobeIcon,
  HistoryIcon,
  KeyRoundIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ListIcon,
  LogInIcon,
  type LucideIcon,
  PlugIcon,
  PlusIcon,
  RouteIcon,
  ScrollTextIcon,
  SearchIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UndoIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react';
import CopyInput from '@/components/forms/copy-input';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';

interface Suggestion {
  icon: LucideIcon;
  text: string;
}

const DEFAULT_PROMPTS: Suggestion[] = [
  {
    icon: ArrowLeftRightIcon,
    text: 'What changed this week compared to last week?',
  },
  {
    icon: ChartLineIcon,
    text: 'Show me unique visitors per day for the last 30 days',
  },
  {
    icon: LayoutDashboardIcon,
    text: 'Build a dashboard for signups and where they come from',
  },
  { icon: PlugIcon, text: 'How do I connect the MCP server to Claude?' },
];

function promptsFor(hint?: ChatLaunchHint): Suggestion[] {
  switch (hint?.page) {
    case 'profile':
      return [
        { icon: UserIcon, text: 'Tell me about this user' },
        { icon: HistoryIcon, text: 'What did they do in their last session?' },
        {
          icon: UsersIcon,
          text: 'How does this user compare to a typical one?',
        },
        { icon: ListIcon, text: 'Which pages did they visit most?' },
      ];
    case 'session':
      return [
        { icon: RouteIcon, text: 'Walk me through this session' },
        { icon: CompassIcon, text: 'Where did this visitor come from?' },
        { icon: TargetIcon, text: 'Did they convert?' },
        {
          icon: LayersIcon,
          text: 'Show similar sessions from the same referrer',
        },
      ];
    case 'dashboard':
      return [
        { icon: ScrollTextIcon, text: 'Summarize this dashboard' },
        {
          icon: TrendingUpIcon,
          text: 'Which report changed the most this week?',
        },
        {
          icon: PlusIcon,
          text: 'Add a chart of signups by referrer to this dashboard',
        },
        {
          icon: TriangleAlertIcon,
          text: 'Which of these charts should I worry about?',
        },
      ];
    case 'seo':
      return [
        { icon: SearchIcon, text: 'Which queries are the easiest wins?' },
        { icon: TrendingUpIcon, text: 'Is my organic traffic trending up?' },
        { icon: GitForkIcon, text: 'Any pages competing for the same query?' },
        { icon: GlobeIcon, text: 'Top pages in Google last 30 days' },
      ];
    case 'pages':
      return [
        { icon: UndoIcon, text: 'Which pages have the highest bounce rate?' },
        { icon: LogInIcon, text: 'Top entry pages last 7 days' },
        { icon: TrendingDownIcon, text: 'Which pages are losing traffic?' },
        { icon: ChartLineIcon, text: 'Chart pageviews for /pricing over time' },
      ];
    case 'onboarding':
      return [
        { icon: TriangleAlertIcon, text: 'Why are no events arriving?' },
        { icon: GlobeIcon, text: 'Check my install on my website' },
        { icon: CodeIcon, text: 'Which SDK fits my stack?' },
        {
          icon: ActivityIcon,
          text: 'Show the last events that reached this project',
        },
      ];
    case 'events':
      return [
        { icon: ZapIcon, text: 'Which events fire most often?' },
        { icon: ListIcon, text: 'Show me the last 20 purchase events' },
        { icon: FilterIcon, text: 'Build a funnel from signup to purchase' },
        {
          icon: ChartBarIcon,
          text: 'Chart the daily count of each conversion event',
        },
      ];
    default:
      return DEFAULT_PROMPTS;
  }
}

export function ChatEmpty({
  hint,
  onPick,
}: {
  hint?: ChatLaunchHint;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 py-10">
      <div className="space-y-1.5 text-center">
        <h1 className="font-semibold text-2xl tracking-tight">
          <DashboardText i18nKey={'What do you want to know?'} />{' '}
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          <DashboardText
            i18nKey={
              'Ask about your numbers, get charts inline, build dashboards, or ask how OpenPanel works.'
            }
          />{' '}
        </p>
      </div>
      <div className="space-y-2">
        <p className="px-1 font-medium text-muted-foreground text-xs">
          <DashboardText i18nKey={'Try asking'} />{' '}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {promptsFor(hint).map(({ icon: Icon, text }) => (
            <button
              className="group flex items-center gap-3 rounded-xl bg-def-200 px-3.5 py-3 text-left text-sm transition-colors hover:bg-def-300 dark:bg-def-300 dark:hover:bg-def-400/60"
              key={text}
              onClick={() => onPick(text)}
              type="button"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              <span className="min-w-0 flex-1">{text}</span>
              <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChatNotConfigured() {
  const { t: translateUi } = useDashboardTranslation();

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <KeyRoundIcon className="size-5" />
      </div>
      <div>
        <h1 className="font-semibold text-2xl">
          <DashboardText i18nKey={'AI chat is not configured'} />
        </h1>
        <p className="mt-2 text-muted-foreground">
          <DashboardText i18nKey={'Set'} /> <code>OPENAI_API_KEY</code>{' '}
          <DashboardText i18nKey={'or'} /> <code>ANTHROPIC_API_KEY</code>{' '}
          <DashboardText i18nKey={'on the API service and restart it.'} />{' '}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <CopyInput
          label={translateUi('OpenAI')}
          value="OPENAI_API_KEY=sk-..."
        />
        <CopyInput
          label={translateUi('Anthropic')}
          value="ANTHROPIC_API_KEY=sk-ant-..."
        />
      </div>
      <a
        className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        href="https://openpanel.dev/docs/self-hosting/environment-variables#ai-features"
        rel="noopener"
        target="_blank"
      >
        <DashboardText i18nKey={'View setup docs'} />{' '}
        <ExternalLinkIcon className="size-3.5" />
      </a>
    </div>
  );
}
