import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { op } from '@/utils/op';

// Getting-started checklist shown on the project overview until every step is
// done (or the user dismisses it). Steps derive from existing data — no state
// machine: first event (Project.firstEventAt), first report, invited teammate.

const dismissKey = (projectId: string) =>
  `op-activation-checklist-dismissed:${projectId}`;

const readDismissed = (projectId: string) => {
  try {
    return localStorage.getItem(dismissKey(projectId)) === '1';
  } catch {
    return true;
  }
};

export default function ActivationChecklist() {
  const { organizationId, projectId } = useAppParams();
  const trpc = useTRPC();

  // Hidden until mounted so SSR and the first client render agree.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(readDismissed(projectId));
  }, [projectId]);

  const statusQuery = useQuery(
    trpc.project.activationStatus.queryOptions(
      { projectId },
      { enabled: !dismissed }
    )
  );
  const status = statusQuery.data;

  if (dismissed || !status) {
    return null;
  }

  const steps = [
    {
      key: 'first-event',
      label: 'Install the SDK and receive your first event',
      done: !!status.firstEventAt,
      action: (
        <Button asChild size="sm" variant="outline">
          <a href={`/onboarding/${projectId}/connect`}>Set up tracking</a>
        </Button>
      ),
    },
    {
      key: 'first-report',
      label: 'Create your first report',
      done: status.hasReport,
      action: (
        <Button asChild size="sm" variant="outline">
          <Link
            params={{ organizationId, projectId }}
            to="/$organizationId/$projectId/reports"
          >
            Explore reports
          </Link>
        </Button>
      ),
    },
    {
      key: 'invite-teammate',
      label: 'Invite a teammate',
      done: status.hasTeammate,
      action: (
        <Button
          onClick={() => {
            op.track('activation_checklist_invite_clicked', { projectId });
            pushModal('CreateInvite');
          }}
          size="sm"
          variant="outline"
        >
          Invite
        </Button>
      ),
    },
  ];

  const remaining = steps.filter((step) => !step.done);
  if (remaining.length === 0) {
    return null;
  }

  const dismiss = () => {
    op.track('activation_checklist_dismissed', { projectId });
    try {
      localStorage.setItem(dismissKey(projectId), '1');
    } catch {
      // Storage unavailable — the checklist just shows again next session.
    }
    setDismissed(true);
  };

  return (
    <div className="card col-span-6 p-4">
      <div className="row items-center justify-between">
        <div className="font-medium text-lg">
          Get set up ({steps.length - remaining.length}/{steps.length})
        </div>
        <Button onClick={dismiss} size="icon" variant="ghost">
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="col mt-2 gap-2">
        {steps.map((step) => (
          <div
            className="row items-center justify-between gap-4 rounded-md border p-3"
            key={step.key}
          >
            <div className="row items-center gap-3">
              <div
                className={cn(
                  'center-center size-5 rounded-full border',
                  step.done && 'border-emerald-600 bg-emerald-600 text-white'
                )}
              >
                {step.done && <CheckIcon className="size-3" />}
              </div>
              <span className={cn(step.done && 'text-muted-foreground')}>
                {step.label}
              </span>
            </div>
            {!step.done && step.action}
          </div>
        ))}
      </div>
    </div>
  );
}
