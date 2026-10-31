import Link from 'next/link';
import {
  MiniFunnel,
  MiniNotification,
  MiniRealtime,
  MiniReplay,
  MiniRetention,
  MiniRevenue,
} from '@/components/dashboard-mock/minis';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import { MORE_FEATURES } from '@/lib/nav';

interface BentoItem {
  title: string;
  description: string;
  href: string;
  visual: React.ReactNode;
}

const ITEMS: BentoItem[] = [
  {
    title: 'Funnels',
    description: 'Any events in any order. See where people stop.',
    href: '/features/funnels',
    visual: <MiniFunnel />,
  },
  {
    title: 'Retention',
    description: 'Who comes back, by the week they joined.',
    href: '/features/retention',
    visual: <MiniRetention />,
  },
  {
    title: 'Session replay',
    description: 'Watch what a user did, next to their events.',
    href: '/features/session-replay',
    visual: <MiniReplay />,
  },
  {
    title: 'Notifications',
    description: 'A drop, a spike or a new customer, sent to Slack or Discord.',
    href: '/features/notifications',
    visual: <MiniNotification />,
  },
  {
    title: 'Revenue',
    description:
      'Payments tied to the users, referrers and campaigns behind them.',
    href: '/features/revenue-tracking',
    visual: <MiniRevenue />,
  },
  {
    title: 'Realtime',
    description: 'Who is on your site right now, and what they are looking at.',
    href: '/features/web-analytics',
    visual: <MiniRealtime />,
  },
];

const SHOWN = new Set(ITEMS.map((item) => item.href));

export function FeaturesBento() {
  const remaining = MORE_FEATURES.filter((feature) => !SHOWN.has(feature.href));
  return (
    <section className="col container gap-12 py-16 md:py-24">
      <Reveal>
        <SectionHeader
          align="center"
          description="Unlimited sites, team members, dashboards and charts. You only pay for events."
          title="And everything around it"
          variant="sm"
        />
      </Reveal>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((item, index) => (
          <Reveal as="li" delay={index * 70} key={item.href}>
            <Link
              className="group surface surface-hover col h-full gap-5 p-6"
              href={item.href}
            >
              <div aria-hidden className="h-40 overflow-hidden">
                {item.visual}
              </div>
              <span className="col gap-1">
                <span className="font-medium">{item.title}</span>
                <span className="text-neutral-600 text-sm">
                  {item.description}
                </span>
              </span>
            </Link>
          </Reveal>
        ))}
      </ul>
      <ul className="row flex-wrap justify-center gap-2">
        {remaining.map((feature) => (
          <li key={feature.href}>
            <Link
              className="row items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm ring-1 ring-black/6 transition-colors hover:bg-neutral-900 hover:text-white"
              href={feature.href}
            >
              <feature.icon className="size-3.5" />
              {feature.title}
            </Link>
          </li>
        ))}
        <li>
          <Link
            className="row items-center gap-2 rounded-full px-3.5 py-2 font-medium text-sm underline-offset-4 hover:underline"
            href="/features"
          >
            All features
          </Link>
        </li>
      </ul>
    </section>
  );
}
