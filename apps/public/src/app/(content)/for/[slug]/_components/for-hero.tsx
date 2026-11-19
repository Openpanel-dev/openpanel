import { AUDIENCE_HERO } from './for-visuals';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { VisualMock } from '@/components/visual-mock';
import type { ForData } from '@/lib/for';

function heroMock(audience: string) {
  const mock = AUDIENCE_HERO[audience];
  if (!mock) {
    throw new Error(
      `No hero visual for audience "${audience}" in for-visuals.tsx`
    );
  }
  return mock;
}

export function ForHero({ data }: { data: ForData }) {
  return (
    <FeatureHero
      description={data.hero.subheading}
      title={data.hero.heading}
      visual={<VisualMock name={heroMock(data.audience)} />}
    />
  );
}
