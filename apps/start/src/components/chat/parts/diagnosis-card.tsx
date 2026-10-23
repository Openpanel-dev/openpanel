import { Link } from '@tanstack/react-router';
import {
  AlertTriangleIcon,
  CheckIcon,
  InfoIcon,
  XCircleIcon,
} from 'lucide-react';

interface Finding {
  level: 'ok' | 'warn' | 'error' | 'info';
  check: string;
  message: string;
}

export interface DiagnosisOutput {
  url: string;
  status: 'healthy' | 'warnings' | 'issues';
  findings: Finding[];
  settingsUrl?: string;
}

const STATUS_LABELS: Record<DiagnosisOutput['status'], string> = {
  healthy: 'Looks good',
  warnings: 'Worth a look',
  issues: 'Needs attention',
};

const STATUS_STYLES: Record<DiagnosisOutput['status'], string> = {
  healthy:
    'rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 text-xs',
  warnings: 'rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 text-xs',
  issues: 'rounded-full bg-destructive/10 px-2 py-0.5 text-destructive text-xs',
};

function LevelIcon({ level }: { level: Finding['level'] }) {
  switch (level) {
    case 'ok':
      return <CheckIcon className="size-4 shrink-0 text-emerald-500" />;
    case 'warn':
      return <AlertTriangleIcon className="size-4 shrink-0 text-amber-500" />;
    case 'error':
      return <XCircleIcon className="size-4 shrink-0 text-destructive" />;
    default:
      return <InfoIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
}

/** The tracking checklist: one line per check, problems first. */
export function DiagnosisCard({ output }: { output: DiagnosisOutput }) {
  const order: Record<Finding['level'], number> = {
    error: 0,
    warn: 1,
    info: 2,
    ok: 3,
  };
  const findings = [...output.findings].sort(
    (a, b) => order[a.level] - order[b.level]
  );
  const settingsPath = output.settingsUrl
    ? new URL(output.settingsUrl).pathname
    : null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="min-w-0">
          <div className="font-medium text-sm">Tracking check</div>
          <div className="truncate text-muted-foreground text-xs">
            {output.url}
          </div>
        </div>
        <span className={STATUS_STYLES[output.status]}>
          {STATUS_LABELS[output.status]}
        </span>
      </div>
      <ul className="divide-y">
        {findings.map((finding) => (
          <li
            className="flex items-start gap-2 px-4 py-2 text-sm"
            key={`${finding.check}-${finding.message}`}
          >
            <LevelIcon level={finding.level} />
            <span className="min-w-0">{finding.message}</span>
          </li>
        ))}
      </ul>
      {settingsPath && output.status !== 'healthy' && (
        <div className="border-t px-4 py-2 text-xs">
          <Link
            className="text-primary underline underline-offset-2"
            to={settingsPath}
          >
            Open project settings
          </Link>
        </div>
      )}
    </div>
  );
}
