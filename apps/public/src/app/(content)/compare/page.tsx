import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { Section, SectionHeader } from '@/components/section';
import { WindowImage } from '@/components/window-image';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { compareSource } from '@/lib/source';
import type { Metadata } from 'next';
import { CompareHero } from './[slug]/_components/compare-hero';
import { CompareCard } from './_components/compare-card';

const title = 'Compare OpenPanel with alternatives';
const description =
  'See detailed feature and pricing comparisons between OpenPanel and popular analytics tools. Honest breakdowns showing what each tool does well and where OpenPanel provides better value.';

export const metadata: Metadata = getPageMetadata({
  title,
  description,
  url: url('/compare'),
  image: getOgImageUrl('/compare'),
});

const heroData = {
  heading: 'Compare OpenPanel with any alternative',
  subheading:
    'See detailed feature and pricing comparisons between OpenPanel and popular analytics tools. Honest breakdowns showing what each tool does well and where OpenPanel provides better value for growing teams.',
  badges: ['30 days free trial', 'Unlimited users', '30-second setup'],
};

export default async function CompareIndexPage() {
  const comparisons = compareSource.sort((a, b) =>
    a.competitor.name.localeCompare(b.competitor.name),
  );

  return (
    <div>
      <CompareHero hero={heroData} />

      <div className="container my-16">
        <WindowImage
          srcDark="/screenshots/overview-dark.png"
          srcLight="/screenshots/overview-light.png"
          alt="OpenPanel Dashboard Overview"
          caption="This is our web analytics dashboard, its an out-of-the-box experience so you can start understanding your traffic and engagement right away."
        />
      </div>

      <Section className="container">
        <SectionHeader
          title="All product comparisons"
          description="Browse our complete list of detailed comparisons. See how OpenPanel stacks up against each competitor on features, pricing, and value."
          variant="sm"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
          {comparisons.map((comparison) => (
            <CompareCard
              key={comparison.slug}
              url={comparison.url}
              name={comparison.competitor.name}
              description={comparison.competitor.short_description}
            />
          ))}
        </div>
      </Section>

      <CtaBanner
        title="Ready to get started?"
        description="Join thousands of teams using OpenPanel for their analytics needs."
        ctaText="Get Started Free"
        ctaLink="https://dashboard.openpanel.dev/onboarding"
      />
    </div>
  );
}
