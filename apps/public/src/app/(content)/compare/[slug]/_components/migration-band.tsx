import { CheckIcon, MinusIcon } from 'lucide-react';
import { Band } from '@/components/band';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import type { CompareMigration } from '@/lib/compare';
import { cn } from '@/lib/utils';

const STAGGER_MS = 80;

const COLUMNS: Record<number, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
};

function Fact({
  label,
  value,
  note,
  yes,
}: {
  label: string;
  value: string;
  note?: string;
  yes?: boolean;
}) {
  return (
    <div className="surface col gap-2 p-5">
      <span className="text-neutral-500 text-xs uppercase tracking-wider">
        {label}
      </span>
      <span className="row items-center gap-2 font-semibold text-lg capitalize">
        {yes !== undefined && (
          <span
            className={cn(
              'center-center size-5 rounded-full',
              yes
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-neutral-100 text-neutral-400'
            )}
          >
            {yes ? (
              <CheckIcon className="size-3" />
            ) : (
              <MinusIcon className="size-3" />
            )}
          </span>
        )}
        {value}
      </span>
      {note && <span className="text-neutral-600 text-sm">{note}</span>}
    </div>
  );
}

// Switching, as a band: three facts, then the steps in one row.
export function MigrationBand({
  migration,
  competitorName,
}: {
  migration: CompareMigration;
  competitorName: string;
}) {
  const columns = COLUMNS[Math.min(Math.max(migration.steps.length, 3), 5)];
  return (
    <Band id="migration" innerClassName="col gap-12" tone="grey">
      <Reveal>
        <SectionHeader
          align="center"
          description={migration.intro}
          label={`Switching from ${competitorName}`}
          title={migration.title}
          variant="sm"
        />
      </Reveal>
      <Reveal className="grid grid-cols-1 gap-4 md:grid-cols-3" delay={60}>
        <Fact label="Effort" value={migration.difficulty} />
        <Fact label="Time" value={migration.estimated_time} />
        <Fact
          label="History"
          note={migration.historical_data.notes}
          value={
            migration.historical_data.can_import
              ? 'Importer built in'
              : 'Starts fresh'
          }
          yes={migration.historical_data.can_import}
        />
      </Reveal>
      <ol
        className={cn(
          'grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2',
          columns
        )}
      >
        {migration.steps.map((step, index) => (
          <Reveal
            as="li"
            className="col gap-2"
            delay={index * STAGGER_MS}
            key={step.title}
          >
            <span className="center-center size-7 rounded-full bg-neutral-900 font-mono text-[12px] text-white">
              {index + 1}
            </span>
            <h3 className="font-medium">{step.title}</h3>
            <p className="text-neutral-600 text-sm">{step.description}</p>
          </Reveal>
        ))}
      </ol>
      <Reveal
        className="mx-auto max-w-2xl text-center text-neutral-600 text-sm"
        delay={120}
      >
        {migration.sdk_compatibility.notes}
      </Reveal>
    </Band>
  );
}
