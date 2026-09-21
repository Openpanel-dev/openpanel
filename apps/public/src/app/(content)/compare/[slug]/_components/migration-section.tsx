import { CheckIcon, ClockIcon } from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import type { CompareMigration } from '@/lib/compare';

interface MigrationSectionProps {
  migration: CompareMigration;
}

export function MigrationSection({ migration }: MigrationSectionProps) {
  return (
    <Section className="container">
      <SectionHeader
        description={migration.intro}
        title={migration.title}
        variant="sm"
      />

      {/* Difficulty and time */}
      <div className="row mt-8 gap-6">
        <div className="col gap-2">
          <div className="row items-center gap-2 text-muted-foreground text-sm">
            <ClockIcon className="size-4" />
            <span className="font-medium">Difficulty:</span>
            <span className="capitalize">{migration.difficulty}</span>
          </div>
        </div>
        <div className="col gap-2">
          <div className="row items-center gap-2 text-muted-foreground text-sm">
            <ClockIcon className="size-4" />
            <span className="font-medium">Estimated time:</span>
            <span>{migration.estimated_time}</span>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="col mt-12 gap-4">
        {migration.steps.map((step, index) => (
          <div className="col gap-2 rounded-2xl border p-6" key={step.title}>
            <div className="row items-start gap-3">
              <div className="center-center size-8 shrink-0 rounded-full bg-primary/10 font-semibold text-sm">
                {index + 1}
              </div>
              <div className="col flex-1 gap-1">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {step.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SDK Compatibility */}
      <div className="mt-12 rounded-2xl border bg-muted/30 p-6">
        <div className="col gap-4">
          <div className="row items-center gap-2">
            <CheckIcon className="size-5 text-green-500" />
            <h3 className="font-semibold">SDK Compatibility</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            {migration.sdk_compatibility.notes}
          </p>
        </div>
      </div>

      {/* Historical Data */}
      <div className="mt-6 rounded-2xl border bg-muted/30 p-6">
        <div className="col gap-4">
          <div className="row items-center gap-2">
            {migration.historical_data.can_import ? (
              <CheckIcon className="size-5 text-green-500" />
            ) : (
              <CheckIcon className="size-5 text-muted-foreground" />
            )}
            <h3 className="font-semibold">Historical Data Import</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            {migration.historical_data.notes}
          </p>
        </div>
      </div>
    </Section>
  );
}
