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
    title: 'Visualize your data',
    description:
      'See your data in a visual way. You can create advanced reports and more to understand',
    icon: ChartBarIcon,
    slug: 'data-visualization',
  },
  {
    title: 'Share & Collaborate',
    description:
      'Invite unlimited members with org-wide or project-level access. Share full dashboards or individual reports—publicly or behind a password.',
    icon: LayoutDashboardIcon,
    slug: 'share-and-collaborate',
  },
  {
    title: 'Integrations',
    description:
      'Get notified when new events are created, or forward specific events to your own systems with our easy-to-use integrations.',
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
