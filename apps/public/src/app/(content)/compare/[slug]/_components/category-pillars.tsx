import {
  CATEGORY_PILLARS,
  type CategoryPillar,
  INSTALL_LINES,
} from './compare-visuals';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { Pillar } from '@/components/blocks/pillar';
import { VisualMock } from '@/components/visual-mock';
import type { CompareCategory } from '@/lib/compare';
import { cn } from '@/lib/utils';

function fill(text: string, competitor: string) {
  return text.replaceAll('{competitor}', competitor);
}

function PillarVisual({
  visual,
  reverse,
}: {
  visual: CategoryPillar['visual'];
  reverse: boolean;
}) {
  if (visual === 'install') {
    return (
      <div
        aria-hidden
        className={cn(
          'rounded-3xl bg-neutral-100 p-6 md:p-10',
          reverse ? 'bleed-left' : 'bleed-right'
        )}
      >
        <CodeSnippet lines={INSTALL_LINES} />
      </div>
    );
  }
  if (visual.side === 'bottom') {
    return (
      <VisualMock
        bleed={reverse ? 'left' : 'right'}
        frame="inset"
        name={visual.mock}
        side="bottom"
      />
    );
  }
  return (
    <VisualMock
      bleed={reverse ? 'left' : 'right'}
      frame="inset"
      name={visual.mock}
    />
  );
}

// Two or three pillars that show the part of OpenPanel closest to what the
// competitor does, then what it adds.
export function CategoryPillars({
  category,
  competitorName,
}: {
  category: CompareCategory;
  competitorName: string;
}) {
  return (
    <div className="col py-6">
      {CATEGORY_PILLARS[category].map((pillar, index) => {
        const reverse = index % 2 === 1;
        return (
          <Pillar
            description={fill(pillar.description, competitorName)}
            key={pillar.title}
            label={pillar.label}
            points={pillar.points}
            reverse={reverse}
            title={pillar.title}
            visual={<PillarVisual reverse={reverse} visual={pillar.visual} />}
          />
        );
      })}
    </div>
  );
}
