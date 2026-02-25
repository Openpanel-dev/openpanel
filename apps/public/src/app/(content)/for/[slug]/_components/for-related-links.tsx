import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Section, SectionHeader } from '@/components/section';
import type { ForRelatedLinks } from '@/lib/for';

interface ForRelatedLinksProps {
  relatedLinks: ForRelatedLinks;
}

export function ForRelatedLinksSection({ relatedLinks }: ForRelatedLinksProps) {
  const hasLinks =
    relatedLinks.articles?.length ||
    relatedLinks.guides?.length ||
    relatedLinks.comparisons?.length;

  if (!hasLinks) {
    return null;
  }

  return (
    <Section className="container">
      <SectionHeader
        description="Learn more about OpenPanel and how it can help you."
        title="Related resources"
        variant="sm"
      />
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {relatedLinks.guides && relatedLinks.guides.length > 0 && (
          <div className="col gap-4">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
              Guides
            </h3>
            {relatedLinks.guides.map((link) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={link.url}
                key={link.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {link.title}
              </Link>
            ))}
          </div>
        )}
        {relatedLinks.articles && relatedLinks.articles.length > 0 && (
          <div className="col gap-4">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
              Articles
            </h3>
            {relatedLinks.articles.map((link) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={link.url}
                key={link.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {link.title}
              </Link>
            ))}
          </div>
        )}
        {relatedLinks.comparisons && relatedLinks.comparisons.length > 0 && (
          <div className="col gap-4">
            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
              Comparisons
            </h3>
            {relatedLinks.comparisons.map((link) => (
              <Link
                className="row items-center gap-2 text-sm transition-colors hover:text-primary"
                href={link.url}
                key={link.url}
              >
                <ArrowRightIcon className="size-4 shrink-0" />
                {link.title}
              </Link>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
