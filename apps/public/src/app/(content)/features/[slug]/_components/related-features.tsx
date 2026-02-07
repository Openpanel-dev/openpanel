import { FeatureCardContainer } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import type { RelatedFeature } from '@/lib/features';
import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';

interface RelatedFeaturesProps {
  title?: string;
  related: RelatedFeature[];
}

export function RelatedFeatures({
  title = 'Related features',
  related,
}: RelatedFeaturesProps) {
  if (related.length === 0) return null;

  return (
    <Section className="container">
      <SectionHeader
        title={title}
        description="Explore more capabilities that work together with this feature."
        variant="sm"
        className="mb-12"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {related.map((item) => (
          <Link key={item.slug} href={`/features/${item.slug}`}>
            <FeatureCardContainer>
              <div className="row gap-3 items-center">
                <div className="col gap-1 flex-1 min-w-0">
                  <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
                <ArrowRightIcon className="opacity-0 group-hover:opacity-100 size-5 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
              </div>
            </FeatureCardContainer>
          </Link>
        ))}
      </div>
    </Section>
  );
}
