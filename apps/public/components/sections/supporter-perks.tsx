import {
  CheckIcon,
  HeartHandshakeIcon,
  MessageSquareIcon,
  PackageIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  ZapIcon,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const perks = [
  {
    icon: PackageIcon,
    title: 'Latest Docker Images',
    description: 'Access to bleeding-edge builds on every commit',
    href: '/docs/self-hosting/supporter-access-latest-docker-images',
    highlight: true,
  },
  {
    icon: MessageSquareIcon,
    title: 'Prioritized Support',
    description: 'Get help faster with priority Discord support',
    highlight: true,
  },
  {
    icon: RocketIcon,
    title: 'Feature Requests',
    description: 'Your ideas get prioritized in our roadmap',
    highlight: true,
  },
  {
    icon: StarIcon,
    title: 'Exclusive Discord Role',
    description: 'Special badge and recognition in our community',
  },
  {
    icon: SparklesIcon,
    title: 'Early Access',
    description: 'Try new features before public release',
  },
  {
    icon: ZapIcon,
    title: 'Direct Impact',
    description: 'Your support directly funds development',
  },
];

export function SupporterPerks({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'col gap-4 rounded-xl border bg-card p-6',
        'sticky top-24',
        className
      )}
    >
      <div className="col mb-2 gap-2">
        <div className="row items-center gap-2">
          <HeartHandshakeIcon className="size-5 text-primary" />
          <h3 className="font-semibold text-lg">Supporter Perks</h3>
        </div>
        <p className="text-muted-foreground text-sm">
          Everything you get when you support OpenPanel
        </p>
      </div>

      <div className="col gap-3">
        {perks.map((perk, index) => {
          const Icon = perk.icon;
          return (
            <div
              className={cn(
                'col gap-1.5 rounded-lg border p-3 transition-colors',
                perk.highlight
                  ? 'border-primary/20 bg-primary/5'
                  : 'border-border bg-background'
              )}
              key={index}
            >
              <div className="row items-start gap-2">
                <Icon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    perk.highlight ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <div className="col min-w-0 flex-1 gap-0.5">
                  <div className="row items-center gap-2">
                    <h4
                      className={cn(
                        'font-medium text-sm',
                        perk.highlight && 'text-primary'
                      )}
                    >
                      {perk.title}
                    </h4>
                    {perk.highlight && (
                      <CheckIcon className="size-3.5 shrink-0 text-primary" />
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {perk.description}
                  </p>
                  {perk.href && (
                    <Link
                      className="mt-1 text-primary text-xs hover:underline"
                      href={perk.href}
                    >
                      Learn more →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t pt-4">
        <p className="text-center text-muted-foreground text-xs">
          Starting at <strong className="text-foreground">$20/month</strong>
        </p>
      </div>
    </div>
  );
}
