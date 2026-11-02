import { cloneElement, isValidElement } from 'react';
import { CodeSnippet } from './code-snippet';
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

// Code blocks are dark panels of their own; everything else gets the white
// card frame so a small mini does not float in empty space.
function isCodeSnippet(
  visual: React.ReactNode
): visual is React.ReactElement<React.ComponentProps<typeof CodeSnippet>> {
  return isValidElement(visual) && visual.type === CodeSnippet;
}

// Code is part of the instructions, so it stays readable by assistive
// technology; replicas are decorative and hidden.
function StepVisual({ visual }: { visual: React.ReactNode }) {
  if (isCodeSnippet(visual)) {
    return (
      <div className="h-48 overflow-hidden rounded-xl">
        {cloneElement(visual, { decorative: false })}
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={cn('h-48 overflow-hidden rounded-xl', visual && 'surface p-4')}
    >
      {visual}
    </div>
  );
}

// "How it works" as one row of numbered steps on a grey band. The columns
// share rows, so every visual starts at the same height whatever the text
// above it did.
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
  const hasVisuals = steps.some((step) => step.visual);
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
          'grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-2',
          steps.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        )}
      >
        {steps.map((step, index) => (
          <Reveal
            as="li"
            className={cn(
              'grid gap-5',
              hasVisuals && 'row-span-2 grid-rows-subgrid'
            )}
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
            {hasVisuals && <StepVisual visual={step.visual} />}
          </Reveal>
        ))}
      </ol>
    </Band>
  );
}
