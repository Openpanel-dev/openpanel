import {
  ChartBarIcon,
  ChevronRightIcon,
  LayoutDashboardIcon,
  WorkflowIcon,
} from 'lucide-react';
import Link from 'next/link';
import { CollaborationChart } from './collaboration-chart';
import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';

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
      <div className="grid grid-cols-1 gap-16 md:grid-cols-2">
        <CollaborationChart />
        <div>
          <SectionHeader
            description="Build interactive dashboards, share insights with your team, and make data-driven decisions faster. OpenPanel helps you understand not just what's happening, but why."
            title="Turn data into actionable insights"
          />

          <GetStartedButton className="mt-6" />

          <div className="col mt-16 gap-6">
            {features.map((feature) => (
              <Link
                className="group col relative gap-2 overflow-hidden pr-10"
                href={`/features/${feature.slug}`}
                key={feature.title}
              >
                <h3 className="font-semibold">
                  <feature.icon className="relative -top-0.5 mr-2 inline-block size-6" />
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {feature.description}
                </p>
                <ChevronRightIcon
                  aria-hidden
                  className="absolute top-1/2 right-0 size-5 translate-x-full -translate-y-1/2 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0"
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
