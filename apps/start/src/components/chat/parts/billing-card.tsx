import { Link } from '@tanstack/react-router';
import { CreditCardIcon } from 'lucide-react';

export interface BillingOutput {
  selfHosted: boolean;
  organization?: string;
  state?: string;
  statusLine?: string | null;
  plan?: {
    name: string | null;
    free: boolean;
    price: number | null;
    currency: string | null;
    interval: string | null;
    eventsLimit: number | null;
  };
  usage?: {
    eventsThisPeriod: number;
    eventsLimit: number | null;
    percentUsed: number | null;
    periodEnd: string | null;
  };
  billingUrl?: string;
}

const number = new Intl.NumberFormat('en-US');
const PERCENT_CAP = 100;

function priceLabel(plan: NonNullable<BillingOutput['plan']>): string {
  if (plan.free) {
    return 'Free';
  }
  if (plan.price === null) {
    return '';
  }
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency?.toUpperCase() || 'USD',
    maximumFractionDigits: 2,
  }).format(plan.price);
  return plan.interval ? `${amount} / ${plan.interval}` : amount;
}

export function BillingCard({ output }: { output: BillingOutput }) {
  if (output.selfHosted || !(output.plan && output.usage)) {
    return null;
  }
  const { plan, usage } = output;
  const percent = Math.min(usage.percentUsed ?? 0, PERCENT_CAP);
  const path = output.billingUrl ? new URL(output.billingUrl).pathname : null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <CreditCardIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate font-medium">
              {plan.name ?? 'No plan'}
              {plan.eventsLimit && (
                <span className="ml-2 font-normal text-muted-foreground">
                  {number.format(plan.eventsLimit)} events
                </span>
              )}
            </div>
            {output.statusLine && (
              <div className="truncate text-muted-foreground text-xs">
                {output.statusLine}
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right text-sm">{priceLabel(plan)}</div>
      </div>
      <div className="border-t px-4 py-3">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">Used this period</span>
          <span className="font-mono tabular-nums">
            {number.format(usage.eventsThisPeriod)}
            {usage.eventsLimit ? ` / ${number.format(usage.eventsLimit)}` : ''}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={
              percent >= PERCENT_CAP
                ? 'h-full bg-destructive'
                : 'h-full bg-primary'
            }
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      {path && (
        <div className="border-t px-4 py-2 text-xs">
          <Link className="text-primary underline underline-offset-2" to={path}>
            Manage billing
          </Link>
        </div>
      )}
    </div>
  );
}
