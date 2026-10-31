import { Band } from '@/components/band';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import { cn } from '@/lib/utils';

export interface Step {
  title: string;
  text: string;
  // A code snippet or a mini replica under the text.
  visual?: React.ReactNode;
}

const STAGGER_MS = 90;

// "How it works" as one row of numbered steps on a grey band.
export function StepsBand({
  label = 'How it works',
  title,
  description,
  steps,
  tone = 'grey',
  id,
}: {
  label?: string;
  title: string;
  description?: string;
  steps: Step[];
  tone?: 'grey' | 'fade' | 'canvas';
  id?: string;
}) {
  return (
    <Band id={id} innerClassName="col gap-12" tone={tone}>
      <Reveal>
        <SectionHeader
          align="center"
          description={description}
          label={label}
          title={title}
          variant="sm"
        />
      </Reveal>
      <ol
        className={cn(
          'grid grid-cols-1 gap-6 md:gap-8',
          steps.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'
        )}
      >
        {steps.map((step, index) => (
          <Reveal
            as="li"
            className="col gap-4"
            delay={index * STAGGER_MS}
            key={step.title}
          >
            <div className="col gap-2">
              <span className="center-center size-7 rounded-full bg-neutral-900 font-mono text-[12px] text-white">
                {index + 1}
              </span>
              <h3 className="font-medium">{step.title}</h3>
              <p className="text-neutral-600 text-sm">{step.text}</p>
            </div>
            {step.visual && <div className="mt-auto">{step.visual}</div>}
          </Reveal>
        ))}
      </ol>
    </Band>
  );
}
