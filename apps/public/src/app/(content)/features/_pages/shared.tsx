import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { RelatedPills } from '@/components/blocks/related-pills';
import { FaqSection } from '@/components/faq';
import type { FeatureData } from '@/lib/features';

export interface FeaturePageProps {
  data: FeatureData;
}

export type FeaturePage = (props: FeaturePageProps) => React.ReactNode;

// The tail every feature page ends with: related features, the FAQ from the
// page's JSON, and the closing band with the page's own call to action.
export function FeatureClosing({ data }: FeaturePageProps) {
  return (
    <>
      <RelatedPills related={data.related_features} />
      <div id="faq">
        <FaqSection
          description={data.faqs.intro}
          items={data.faqs.items}
          title={data.faqs.title}
        />
      </div>
      <CtaBanner ctaLink={data.cta.href} ctaText={data.cta.label} />
    </>
  );
}
