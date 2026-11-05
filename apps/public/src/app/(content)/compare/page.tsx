import { ArrowRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorMark } from './[slug]/_components/versus-mark';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import { VisualMock } from '@/components/visual-mock';
import type { CompareCategory, CompareData } from '@/lib/compare';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { compareSource } from '@/lib/source';

const title = 'Compare OpenPanel with alternatives';
const description =
  'See detailed feature and pricing comparisons between OpenPanel and popular analytics tools. Honest breakdowns showing what each tool does well and where OpenPanel provides better value.';

export const metadata: Metadata = getPageMetadata({
  title,
  description,
  url: url('/compare'),
  image: getOgImageUrl('/compare'),
});

const GROUPS: { category: CompareCategory; label: string; title: string }[] = [
  {
    category: 'product',
    label: 'Product analytics',
    title: 'Funnels, retention and profiles',
  },
  {
    category: 'web',
    label: 'Web analytics',
    title: 'Visitors, sources and pages',
  },
  {
    category: 'replay',
    label: 'Session replay and heatmaps',
    title: 'Watching what users do',
  },
  {
    category: 'attribution',
    label: 'Attribution',
    title: 'Where users and revenue come from',
  },
];

const STAGGER_MS = 60;

function CompetitorCard({ comparison }: { comparison: CompareData }) {
  const competitorSlug = comparison.slug.replace(/-alternative$/, '');
  return (
    <Link
      className="group surface surface-hover col h-full gap-3 p-6"
      href={comparison.url}
    >
      <span className="row items-center justify-between gap-3">
        <CompetitorMark
          name={comparison.competitor.name}
          slug={competitorSlug}
        />
        <ArrowRightIcon className="size-4 text-neutral-400 transition-transform group-hover:translate-x-1" />
      </span>
      <span className="text-neutral-600 text-sm">
        {comparison.competitor.short_description}
      </span>
    </Link>
  );
}

export default function CompareIndexPage() {
  const byName = [...compareSource].sort((a, b) =>
    a.competitor.name.localeCompare(b.competitor.name)
  );

  return (
    <div>
      <FeatureHero
        description="Pricing, features, hosting, privacy and what switching takes, for every tool people weigh OpenPanel against. Each page says where the other tool is better, too."
        title="Compare OpenPanel with any alternative"
        visual={<VisualMock name="web-overview" />}
      />
      <div className="col container gap-20 py-16 md:py-24">
        {GROUPS.map((group) => {
          const comparisons = byName.filter(
            (comparison) => comparison.category === group.category
          );
          if (comparisons.length === 0) {
            return null;
          }
          return (
            <section className="col gap-8" key={group.category}>
              <Reveal>
                <SectionHeader
                  label={group.label}
                  title={group.title}
                  variant="sm"
                />
              </Reveal>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {comparisons.map((comparison, index) => (
                  <Reveal
                    as="li"
                    delay={index * STAGGER_MS}
                    key={comparison.slug}
                  >
                    <CompetitorCard comparison={comparison} />
                  </Reveal>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <CtaBanner
        ctaLink="https://dashboard.openpanel.dev/onboarding"
        ctaText="Start free trial"
      />
    </div>
  );
}
