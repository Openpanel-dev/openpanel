import { FeatureClosing, type FeaturePageProps } from './shared';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { VisualMock } from '@/components/visual-mock';

// TODO(feature-pages): compose this page from PLAN-feature-pages.md.
export function WebAnalyticsPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description={data.hero.subheading}
        title={data.hero.heading}
        visual={<VisualMock name="web-overview" />}
      />
      <FeatureClosing data={data} />
    </>
  );
}
