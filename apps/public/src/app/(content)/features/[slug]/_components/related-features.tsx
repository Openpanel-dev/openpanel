import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCardContainer } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import type { RelatedFeature } from '@/lib/features';

interface RelatedFeaturesProps {
  title?: string;
  related: RelatedFeature[];
}

export function RelatedFeatures({
  title = 'Related features',
  related,
}: RelatedFeaturesProps) {
  if (related.length === 0) {
    return null;
  }

  return (
    <Section className="container">
      <SectionHeader
        className="mb-12"
        description="Explore more capabilities that work together with this feature."
        title={title}
        variant="sm"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((item) => (
          <Link href={`/features/${item.slug}`} key={item.slug}>
            <FeatureCardContainer>
              <div className="row items-center gap-3">
                <div className="col min-w-0 flex-1 gap-1">
                  <h3 className="font-semibold text-lg transition-colors group-hover:text-primary">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="line-clamp-2 text-muted-foreground text-sm">
                      {item.description}
                    </p>
                  )}
                </div>
                <ArrowRightIcon className="size-5 shrink-0 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary group-hover:opacity-100" />
              </div>
            </FeatureCardContainer>
          </Link>
        ))}
      </div>
    </Section>
  );
}
