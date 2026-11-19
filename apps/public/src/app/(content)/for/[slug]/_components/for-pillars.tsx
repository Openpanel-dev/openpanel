import { AUDIENCE_PILLARS, PillarVisual } from './for-visuals';
import { Pillar } from '@/components/blocks/pillar';

export function ForPillars({ audience }: { audience: string }) {
  const pillars = AUDIENCE_PILLARS[audience];
  if (!pillars) {
    throw new Error(`No pillars for audience "${audience}" in for-visuals.tsx`);
  }
  return (
    <div className="col py-6">
      {pillars.map((pillar, index) => {
        const reverse = index % 2 === 1;
        return (
          <Pillar
            description={pillar.description}
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
