import { FeatureCard } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import {
  ChartBarIcon,
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
  },
  {
    title: 'Share & Collaborate',
    description:
      'Build interactive dashboards and share insights with your team. Export reports, set up notifications, and keep everyone aligned.',
    icon: LayoutDashboardIcon,
  },
  {
    title: 'Integrations',
    description:
      'Get notified when new events are created, or forward specific events to your own systems with our east to use integrations.',
    icon: WorkflowIcon,
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
              <div className="col gap-2" key={feature.title}>
                <h3 className="font-semibold">
                  <feature.icon className="size-6 inline-block mr-2 relative -top-0.5" />
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
