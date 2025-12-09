import { FeatureCardContainer } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import type { RelatedLinks } from '@/lib/compare';
import { ArrowRightIcon, BookOpenIcon, GitCompareIcon } from 'lucide-react';
import Link from 'next/link';

interface RelatedLinksProps {
  relatedLinks?: RelatedLinks;
}

export function RelatedLinksSection({ relatedLinks }: RelatedLinksProps) {
  if (
    !relatedLinks ||
    (!relatedLinks.articles?.length && !relatedLinks.alternatives?.length)
  ) {
    return null;
  }

  return (
    <Section className="container">
      <SectionHeader
        title="Related resources"
        description="Explore more comparisons and guides to help you choose the right analytics tool"
        variant="sm"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
        {relatedLinks.articles && relatedLinks.articles.length > 0 && (
          <div className="col gap-4">
            <div className="row gap-2 items-center mb-2">
              <BookOpenIcon className="size-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Articles</h3>
            </div>
            <div className="col gap-3">
              {relatedLinks.articles.map((article) => (
                <Link key={article.url} href={article.url}>
                  <FeatureCardContainer className="hover:border-primary/30 transition-colors">
                    <div className="row gap-3 items-center">
                      <div className="col gap-1 flex-1 min-w-0">
                        <h4 className="text-base font-semibold group-hover:text-primary transition-colors">
                          {article.title}
                        </h4>
                      </div>
                      <ArrowRightIcon className="opacity-0 group-hover:opacity-100 size-4 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
                    </div>
                  </FeatureCardContainer>
                </Link>
              ))}
            </div>
          </div>
        )}

        {relatedLinks.alternatives && relatedLinks.alternatives.length > 0 && (
          <div className="col gap-4">
            <div className="row gap-2 items-center mb-2">
              <GitCompareIcon className="size-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Other comparisons</h3>
            </div>
            <div className="col gap-3">
              {relatedLinks.alternatives.map((alternative) => (
                <Link key={alternative.url} href={alternative.url}>
                  <FeatureCardContainer className="hover:border-primary/30 transition-colors">
                    <div className="row gap-3 items-center">
                      <div className="col gap-1 flex-1 min-w-0">
                        <h4 className="text-base font-semibold group-hover:text-primary transition-colors">
                          {alternative.name} alternative
                        </h4>
                      </div>
                      <ArrowRightIcon className="opacity-0 group-hover:opacity-100 size-4 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
                    </div>
                  </FeatureCardContainer>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
