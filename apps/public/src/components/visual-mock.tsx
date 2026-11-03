import { AI_MOCKS } from './dashboard-mock/ai-overview';
import { EVENT_MOCKS } from './dashboard-mock/events';
import { DashboardShell, Toolbar } from './dashboard-mock/frame';
import { MANAGE_MOCKS } from './dashboard-mock/manage';
import { MINI_MOCKS } from './dashboard-mock/minis';
import { PRODUCT_MOCKS } from './dashboard-mock/product-analytics';
import { PROFILE_MOCKS } from './dashboard-mock/profiles';
import { REPORT_MOCKS } from './dashboard-mock/reports';
import { REVENUE_MOCKS } from './dashboard-mock/revenue';
import { SESSION_MOCKS } from './dashboard-mock/sessions';
import type { MockDefinition } from './dashboard-mock/types';
import { WEB_MOCKS } from './dashboard-mock/web-overview';
import { cn } from '@/lib/utils';

// Every mock a page can show by name. Each dashboard-mock file owns its
// own entries; add a view there and it shows up here and on /visuals.
const MOCKS = {
  ...WEB_MOCKS,
  ...PRODUCT_MOCKS,
  ...REPORT_MOCKS,
  ...SESSION_MOCKS,
  ...PROFILE_MOCKS,
  ...EVENT_MOCKS,
  ...REVENUE_MOCKS,
  ...MANAGE_MOCKS,
  ...AI_MOCKS,
  ...MINI_MOCKS,
} satisfies Record<string, MockDefinition>;

export type VisualMockName = keyof typeof MOCKS;

export const VISUAL_MOCK_NAMES = Object.keys(MOCKS) as VisualMockName[];

export function isVisualMockName(name: string): name is VisualMockName {
  return Object.hasOwn(MOCKS, name);
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
