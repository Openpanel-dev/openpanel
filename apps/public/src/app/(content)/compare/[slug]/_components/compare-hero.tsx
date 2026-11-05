import { CATEGORY_HERO } from './compare-visuals';
import { VersusMark } from './versus-mark';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { VisualMock } from '@/components/visual-mock';
import type { CompareData } from '@/lib/compare';

export function CompareHero({
  data,
  competitorSlug,
}: {
  data: CompareData;
  competitorSlug: string;
}) {
  return (
    <FeatureHero
      description={data.summary_comparison.one_liner}
      eyebrow={<VersusMark name={data.competitor.name} slug={competitorSlug} />}
      title={data.hero.heading}
      visual={<VisualMock name={CATEGORY_HERO[data.category]} />}
    />
  );
}
