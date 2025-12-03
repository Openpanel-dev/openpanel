import { Section, SectionHeader } from '@/components/section';
import { CompareMigration } from '@/lib/compare';
import { CheckIcon, ClockIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MigrationSectionProps {
  migration: CompareMigration;
}

export function MigrationSection({ migration }: MigrationSectionProps) {
  return (
    <Section className="container">
      <SectionHeader
        title={migration.title}
        description={migration.intro}
        variant="sm"
      />
      
      {/* Difficulty and time */}
      <div className="row gap-6 mt-8">
        <div className="col gap-2">
          <div className="row gap-2 items-center text-sm text-muted-foreground">
            <ClockIcon className="size-4" />
            <span className="font-medium">Difficulty:</span>
            <span className="capitalize">{migration.difficulty}</span>
          </div>
        </div>
        <div className="col gap-2">
          <div className="row gap-2 items-center text-sm text-muted-foreground">
            <ClockIcon className="size-4" />
            <span className="font-medium">Estimated time:</span>
            <span>{migration.estimated_time}</span>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="col gap-4 mt-12">
        {migration.steps.map((step, index) => (
          <div key={step.title} className="col gap-2 p-6 border rounded-2xl">
            <div className="row gap-3 items-start">
              <div className="size-8 rounded-full bg-primary/10 center-center shrink-0 font-semibold text-sm">
                {index + 1}
              </div>
              <div className="col gap-1 flex-1">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SDK Compatibility */}
      <div className="mt-12 p-6 border rounded-2xl bg-muted/30">
        <div className="col gap-4">
          <div className="row gap-2 items-center">
            <CheckIcon className="size-5 text-green-500" />
            <h3 className="font-semibold">SDK Compatibility</h3>
          </div>
          <p className="text-sm text-muted-foreground">{migration.sdk_compatibility.notes}</p>
        </div>
      </div>

      {/* Historical Data */}
      <div className="mt-6 p-6 border rounded-2xl bg-muted/30">
        <div className="col gap-4">
          <div className="row gap-2 items-center">
            {migration.historical_data.can_import ? (
              <CheckIcon className="size-5 text-green-500" />
            ) : (
              <CheckIcon className="size-5 text-muted-foreground" />
            )}
            <h3 className="font-semibold">Historical Data Import</h3>
          </div>
          <p className="text-sm text-muted-foreground">{migration.historical_data.notes}</p>
        </div>
      </div>
    </Section>
  );
}

