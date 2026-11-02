import { AUDIENCE_HERO } from './for-visuals';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { VisualMock } from '@/components/visual-mock';
import type { ForData } from '@/lib/for';

export function ForHero({ data }: { data: ForData }) {
  return (
    <FeatureHero
      description={data.hero.subheading}
      title={data.hero.heading}
      visual={
        <VisualMock name={AUDIENCE_HERO[data.audience] ?? 'web-overview'} />
      }
    />
  );
}
