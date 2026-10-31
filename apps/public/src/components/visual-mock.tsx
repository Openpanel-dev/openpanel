import { AiOverviewContent } from './dashboard-mock/ai-overview';
import { ChatMock } from './dashboard-mock/chat';
import {
  type DashboardPage,
  DashboardShell,
  Toolbar,
} from './dashboard-mock/frame';
import {
  MiniFunnel,
  MiniNotification,
  MiniRealtime,
  MiniReplay,
  MiniRetention,
  MiniRevenue,
} from './dashboard-mock/minis';
import {
  ProfileContent,
  SeoContent,
  SessionsContent,
} from './dashboard-mock/more';
import {
  FunnelContent,
  RetentionContent,
} from './dashboard-mock/product-analytics';
import { WebOverviewContent } from './dashboard-mock/web-overview';
import { cn } from '@/lib/utils';

// One entry per thing we can show. `content` is the view itself; `shell`
// says which dashboard page it lives on when shown as a full window.
interface MockDefinition {
  content: () => React.ReactNode;
  shell?: { page: DashboardPage; project: string; range?: string };
  // Natural width of the content when shown cut off at a panel edge.
  insetWidth?: number;
}

const MOCKS = {
  'web-overview': {
    content: () => <WebOverviewContent />,
    shell: { page: 'overview', project: 'Acme Web' },
    insetWidth: 900,
  },
  product: {
    content: () => (
      <>
        <FunnelContent />
        <RetentionContent />
      </>
    ),
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 900,
  },
  funnel: {
    content: () => <FunnelContent />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 820,
  },
  retention: {
    content: () => <RetentionContent />,
    shell: { page: 'reports', project: 'Acme SaaS', range: 'Last 30 days' },
    insetWidth: 820,
  },
  ai: {
    content: () => <AiOverviewContent />,
    shell: { page: 'ai', project: 'Acme SaaS' },
    insetWidth: 900,
  },
  chat: {
    content: () => <ChatMock />,
  },
  seo: {
    content: () => <SeoContent />,
    shell: { page: 'overview', project: 'Acme Web' },
    insetWidth: 900,
  },
  sessions: {
    content: () => <SessionsContent />,
    shell: { page: 'sessions', project: 'Acme Web' },
    insetWidth: 820,
  },
  profile: {
    content: () => <ProfileContent />,
    shell: { page: 'overview', project: 'Acme SaaS' },
    insetWidth: 820,
  },
  'mini-funnel': { content: () => <MiniFunnel /> },
  'mini-retention': { content: () => <MiniRetention /> },
  'mini-replay': { content: () => <MiniReplay /> },
  'mini-notifications': { content: () => <MiniNotification /> },
  'mini-revenue': { content: () => <MiniRevenue /> },
  'mini-realtime': { content: () => <MiniRealtime /> },
} satisfies Record<string, MockDefinition>;

export type VisualMockName = keyof typeof MOCKS;

export const VISUAL_MOCK_NAMES = Object.keys(MOCKS) as VisualMockName[];

export function isVisualMockName(name: string): name is VisualMockName {
  return name in MOCKS;
}

type Frame = 'window' | 'inset' | 'bare';

// `window`: the whole dashboard around the view. `inset`: the view cut off
// at a panel edge, for focusing on one part. `bare`: just the view.
export function VisualMock({
  name,
  frame = 'window',
  side = 'right',
  bleed,
  className,
}: {
  name: VisualMockName;
  frame?: Frame;
  side?: 'right' | 'bottom';
  bleed?: 'left' | 'right';
  className?: string;
}) {
  const mock: MockDefinition = MOCKS[name];

  if (frame === 'bare' || !mock.shell) {
    return <div className={cn('@container', className)}>{mock.content()}</div>;
  }

  if (frame === 'inset') {
    return (
      <Inset
        bleed={bleed}
        className={className}
        side={side}
        width={mock.insetWidth}
      >
        {mock.content()}
      </Inset>
    );
  }

  return (
    <DashboardShell
      active={mock.shell.page}
      className={className}
      project={mock.shell.project}
      toolbar={
        <Toolbar
          range={mock.shell.range}
          withAsk={mock.shell.page === 'overview'}
        />
      }
    >
      {mock.content()}
    </DashboardShell>
  );
}

// A piece of the dashboard cut off at the panel edge, like a window into the
// product. Optionally runs off the viewport on one side.
export function Inset({
  children,
  className,
  width = 760,
  side = 'right',
  bleed,
}: {
  children: React.ReactNode;
  className?: string;
  width?: number;
  side?: 'right' | 'bottom';
  bleed?: 'left' | 'right';
}) {
  const cutBottom = side === 'bottom';
  return (
    <div
      aria-hidden
      className={cn(
        'relative max-h-[520px] overflow-hidden rounded-3xl bg-neutral-100 pt-8 md:pt-12',
        bleed === 'right' && 'bleed-right',
        bleed === 'left' && 'bleed-left',
        cutBottom ? 'px-6 md:px-10' : 'pl-8 md:pl-12',
        className
      )}
    >
      <div
        className={cn(
          '@container col shrink-0 gap-3 border-neutral-200 border-t bg-neutral-50/60 p-4 text-left text-neutral-900 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.2)]',
          cutBottom ? 'rounded-t-xl border-x' : 'rounded-tl-xl border-l'
        )}
        style={cutBottom ? undefined : { width }}
      >
        {children}
      </div>
    </div>
  );
}
