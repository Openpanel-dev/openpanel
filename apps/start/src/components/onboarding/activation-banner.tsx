import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Ping } from '@/components/ping';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { op } from '@/utils/op';

// The project's first funnel: event -> report -> teammate, drawn as three
// nodes on a progress track. The current step carries the product's live ping
// dot, and while the first event is missing the query polls so the banner
// flips green by itself the moment data arrives. Steps derive from existing
// data (Project.firstEventAt, report count, member count) — no state machine.

const dismissKey = (projectId: string) =>
  `op-activation-checklist-dismissed:${projectId}`;

const readDismissed = (projectId: string) => {
  try {
    return localStorage.getItem(dismissKey(projectId)) === '1';
  } catch {
    return true;
  }
};

const HEADLINES = {
  'first-event': {
    title: 'Waiting for your first event',
    sub: 'Install the snippet — this banner lights up the moment data arrives.',
  },
  'first-report': {
    title: 'Data is flowing — now shape it',
    sub: 'Build your first report from the events coming in.',
  },
  'invite-teammate': {
    title: 'Bring your team in',
    sub: 'Invite a teammate to see what you are seeing.',
  },
} as const;

type StepKey = keyof typeof HEADLINES;

export default function ActivationBanner() {
  const { organizationId, projectId } = useAppParams();
  const trpc = useTRPC();
  const navigate = useNavigate();

  // Hidden until mounted so SSR and the first client render agree.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(readDismissed(projectId));
  }, [projectId]);

  const statusQuery = useQuery(
    trpc.project.activationStatus.queryOptions(
      { projectId },
      {
        enabled: !dismissed,
        // Poll only while listening for the first event, so the banner reacts
        // on its own; afterwards the remaining steps are user-driven.
        refetchInterval: (query) =>
          query.state.data && !query.state.data.hasFirstEvent ? 10_000 : false,
      }
    )
  );
  const status = statusQuery.data;

  if (dismissed || !status) {
    return null;
  }

  const steps: {
    key: StepKey;
    label: string;
    done: boolean;
    go: () => void;
  }[] = [
    {
      key: 'first-event',
      label: 'First event',
      done: status.hasFirstEvent,
      go: () => {
        op.track('activation_checklist_setup_clicked', { projectId });
        navigate({
          to: '/onboarding/$projectId/connect',
          params: { projectId },
        });
      },
    },
    {
      key: 'first-report',
      label: 'First report',
      done: status.hasReport,
      go: () => {
        op.track('activation_checklist_report_clicked', { projectId });
        navigate({
          to: '/$organizationId/$projectId/reports',
          params: { organizationId, projectId },
        });
      },
    },
    {
      key: 'invite-teammate',
      label: 'Invite a teammate',
      done: status.hasTeammate,
      go: () => {
        op.track('activation_checklist_invite_clicked', { projectId });
        pushModal('CreateInvite');
      },
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) {
    return null;
  }

  const current = steps.find((step) => !step.done) ?? steps[0]!;
  const headline = HEADLINES[current.key];

  const dismiss = () => {
    op.track('activation_checklist_dismissed', { projectId });
    try {
      localStorage.setItem(dismissKey(projectId), '1');
    } catch {
      // Storage unavailable — the banner just shows again next session.
    }
    setDismissed(true);
  };

  const actions = (
    <>
      <Button onClick={current.go} size="sm">
        {current.key === 'first-event'
          ? 'Set up tracking'
          : current.key === 'first-report'
            ? 'Create a report'
            : 'Invite'}
      </Button>
      <Button onClick={dismiss} size="sm" variant="ghost">
        Skip setup
      </Button>
    </>
  );

  return (
    // Container queries, not viewport breakpoints: the banner sits beside the
    // sidebar, so its own width — not the window's — decides when the
    // three-column row fits. In the stacked layout the actions move up to the
    // headline row (top-right corner) instead of dangling below the funnel.
    <div className="@container relative overflow-hidden border-b bg-card">
      <div
        className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full opacity-20 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(16 185 129) 0%, transparent 70%)',
        }}
      />

      <div className="@5xl:row col relative @5xl:items-center @5xl:justify-between @5xl:gap-10 gap-6 @5xl:p-6 p-4 @5xl:px-8">
        <div className="row @5xl:contents min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="col min-w-0 gap-1">
            <div className="row items-center gap-2 font-mono text-muted-foreground text-xs uppercase tracking-widest">
              Setup funnel
              <span className="text-emerald-600 dark:text-emerald-500">
                {doneCount}/{steps.length}
              </span>
            </div>
            <div className="font-medium text-lg leading-tight">
              {headline.title}
            </div>
            <div className="text-muted-foreground text-sm">{headline.sub}</div>
          </div>

          <div className="row @5xl:hidden shrink-0 items-center gap-2">
            {actions}
          </div>
        </div>

        <div className="row min-w-0 max-w-xl flex-1 items-center gap-0">
          {steps.map((step, index) => {
            const isCurrent = step.key === current.key;
            return (
              <div
                className={cn('row items-center', index > 0 && 'flex-1')}
                key={step.key}
              >
                {index > 0 && (
                  <div
                    className={cn(
                      // Aligned to the node centers (size-7 nodes), not the
                      // taller node+label buttons the row centers against.
                      'mx-2 mt-[13px] h-0.5 min-w-4 flex-1 self-start rounded-full transition-colors',
                      steps[index - 1]!.done ? 'bg-emerald-500' : 'bg-border'
                    )}
                  />
                )}
                <button
                  className={cn(
                    'group col shrink-0 items-center gap-1.5 outline-none',
                    step.done && 'cursor-default'
                  )}
                  disabled={step.done}
                  onClick={step.go}
                  type="button"
                >
                  <span
                    className={cn(
                      'center-center size-7 rounded-full border transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring',
                      step.done &&
                        'border-emerald-500 bg-emerald-500 text-white',
                      !step.done &&
                        isCurrent &&
                        'border-emerald-500/50 bg-background group-hover:border-emerald-500',
                      !(step.done || isCurrent) &&
                        'border-dashed bg-background text-muted-foreground group-hover:border-foreground/40'
                    )}
                  >
                    {step.done ? (
                      <CheckIcon className="size-3.5" />
                    ) : isCurrent ? (
                      <Ping className="motion-reduce:animate-none" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current opacity-40" />
                    )}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-xs transition-colors',
                      step.done && 'text-muted-foreground line-through',
                      !step.done && isCurrent && 'font-medium',
                      !(step.done || isCurrent) && 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="@5xl:flex hidden shrink-0 items-center gap-2">
          {actions}
        </div>
      </div>
    </div>
  );
}
