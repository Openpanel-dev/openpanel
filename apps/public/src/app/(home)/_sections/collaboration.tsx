import { FeatureCard } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import {
  ChartBarIcon,
  ChevronRightIcon,
  DollarSignIcon,
  LayoutDashboardIcon,
  RocketIcon,
  WorkflowIcon,
} from 'lucide-react';
import Link from 'next/link';
import { CollaborationChart } from './collaboration-chart';

const features = [
  {
    title: 'Flexible data visualization',
    description:
      'Build line charts, bar charts, sankey flows, and custom dashboards. Combine metrics from any event into a single view.',
    icon: ChartBarIcon,
    slug: 'data-visualization',
  },
  {
    title: 'Share & Collaborate',
    description:
      'Invite unlimited team members with org-wide or project-level access. Share dashboards publicly or lock them behind a password.',
    icon: LayoutDashboardIcon,
    slug: 'share-and-collaborate',
  },
  {
    title: 'Integrations & Webhooks',
    description:
      'Forward events to your own systems or third-party tools. Connect OpenPanel to Slack, your data warehouse, or any webhook endpoint.',
    icon: WorkflowIcon,
    slug: 'integrations',
  },
];

export function Collaboration() {
  return (
    <Section className="container">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
        <CollaborationChart />
        <div>
          <SectionHeader
            title="Turn data into actionable insights"
            description="Build interactive dashboards, share insights with your team, and make data-driven decisions faster. OpenPanel helps you understand not just what's happening, but why."
          />

          <GetStartedButton className="mt-6" />

          <div className="col gap-6 mt-16">
            {features.map((feature) => (
              <Link
                href={`/features/${feature.slug}`}
                className="group relative col gap-2 pr-10 overflow-hidden"
                key={feature.title}
              >
                <h3 className="font-semibold">
                  <feature.icon className="size-6 inline-block mr-2 relative -top-0.5" />
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {feature.description}
                </p>
                <ChevronRightIcon
                  className="absolute right-0 top-1/2 size-5 -translate-y-1/2 text-muted-foreground transition-transform duration-200 translate-x-full group-hover:translate-x-0"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
