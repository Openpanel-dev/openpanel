import { IllustrationCard, IllustrationPanel } from './shared';

const STEPS = [
  { label: 'Visited pricing', count: '4,210', share: 100 },
  { label: 'Started trial', count: '1,390', share: 33 },
  { label: 'Upgraded', count: '402', share: 9.5 },
];

export function FunnelStepsIllustration() {
  return (
    <IllustrationPanel>
      <IllustrationCard className="max-w-md">
        <div className="row items-baseline justify-between">
          <span className="font-medium">Trial to paid</span>
          <span className="text-muted-foreground text-sm">Last 30 days</span>
        </div>
        <div className="grid h-48 grid-cols-3 items-end gap-3">
          {STEPS.map((step) => (
            <div className="col h-full justify-end gap-2" key={step.label}>
              <span className="font-semibold text-2xl tracking-tight">
                {step.share}%
              </span>
              <div
                className="w-full rounded-lg bg-blue-600"
                style={{ height: `${Math.max(step.share, 6)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {STEPS.map((step) => (
            <div className="col" key={step.label}>
              <span className="font-medium">{step.label}</span>
              <span className="text-muted-foreground">{step.count} users</span>
            </div>
          ))}
        </div>
      </IllustrationCard>
    </IllustrationPanel>
  );
}
