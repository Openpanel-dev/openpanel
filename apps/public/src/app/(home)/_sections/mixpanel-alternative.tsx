import { BarChart2Icon, CoinsIcon, GithubIcon, ServerIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCard } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';

const reasons = [
  {
    icon: CoinsIcon,
    title: 'Fraction of the cost',
    description:
      "Mixpanel's pricing scales to hundreds or thousands per month as your event volume grows. OpenPanel starts at $2.50/month — or self-host for free with no event limits.",
  },
  {
    icon: BarChart2Icon,
    title: 'The features you actually use',
    description:
      'Events, funnels, retention, cohorts, user profiles, custom dashboards, and A/B testing — all there. OpenPanel covers every core analytics workflow from Mixpanel without the learning curve.',
  },
  {
    icon: ServerIcon,
    title: 'Actually self-hostable',
    description:
      'Mixpanel is cloud-only. OpenPanel runs on your own infrastructure with a simple Docker setup. Full data ownership, zero vendor lock-in.',
  },
  {
    icon: GithubIcon,
    title: 'Open source & transparent',
    description:
      "Mixpanel is a black box. OpenPanel's code is public on GitHub — audit it, contribute to it, or fork it. No surprises, no hidden data processing.",
  },
];

export function MixpanelAlternative() {
  return (
    <Section className="container">
      <SectionHeader
        description="Looking for the best Mixpanel alternatives in 2026? OpenPanel covers the product analytics features teams actually use — events, funnels, retention, cohorts, and user profiles — without Mixpanel's pricing, privacy trade-offs, or vendor lock-in."
        label="Best Mixpanel Alternatives"
        title="The Best Mixpanel Alternatives in 2026 — Why Teams Switch to OpenPanel"
      />
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {reasons.map((reason) => (
          <FeatureCard
            description={reason.description}
            icon={reason.icon}
            key={reason.title}
            title={reason.title}
          />
        ))}
      </div>
      <div className="row mt-8 gap-4">
        <GetStartedButton />
        <Button asChild className="px-6" size="lg" variant="outline">
          <Link href="/compare/mixpanel-alternative">
            OpenPanel vs Mixpanel →
          </Link>
        </Button>
      </div>
    </Section>
  );
}
