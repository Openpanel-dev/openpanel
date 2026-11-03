import { CheckIcon } from 'lucide-react';
import { Band } from '@/components/band';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';

export interface Benefit {
  title: string;
  description: string;
}

const STAGGER_MS = 60;

// The "why" list on a grey band: short claims with a check mark each.
export function BenefitsBand({
  label = 'Why OpenPanel',
  title,
  description,
  items,
  id,
}: {
  label?: string;
  title: string;
  description?: string;
  items: Benefit[];
  id?: string;
}) {
  return (
    <Band id={id} innerClassName="col gap-12" tone="grey">
      <Reveal>
        <SectionHeader
          align="center"
          description={description}
          label={label}
          title={title}
          variant="sm"
        />
      </Reveal>
      <ul className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <Reveal
            as="li"
            className="row items-start gap-3"
            delay={index * STAGGER_MS}
            key={item.title}
          >
            <span className="center-center mt-0.5 size-6 shrink-0 rounded-full bg-neutral-900 text-white">
              <CheckIcon className="size-3.5" />
            </span>
            <span className="col gap-1">
              <span className="font-medium">{item.title}</span>
              <span className="text-neutral-600 text-sm">
                {item.description}
              </span>
            </span>
          </Reveal>
        ))}
      </ul>
    </Band>
  );
}
