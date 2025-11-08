import { cn } from '@/lib/utils';
import {
  CheckIcon,
  HeartHandshakeIcon,
  MessageSquareIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  ZapIcon,
  PackageIcon,
} from 'lucide-react';
import Link from 'next/link';

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
        'col gap-4 p-6 rounded-xl border bg-card',
        'sticky top-24',
        className,
      )}
    >
      <div className="col gap-2 mb-2">
        <div className="row gap-2 items-center">
          <HeartHandshakeIcon className="size-5 text-primary" />
          <h3 className="font-semibold text-lg">Supporter Perks</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Everything you get when you support OpenPanel
        </p>
      </div>

      <div className="col gap-3">
        {perks.map((perk, index) => {
          const Icon = perk.icon;
          return (
            <div
              key={index}
              className={cn(
                'col gap-1.5 p-3 rounded-lg border transition-colors',
                perk.highlight
                  ? 'bg-primary/5 border-primary/20'
                  : 'bg-background border-border',
              )}
            >
              <div className="row gap-2 items-start">
                <Icon
                  className={cn(
                    'size-4 mt-0.5 shrink-0',
                    perk.highlight ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                <div className="col gap-0.5 flex-1 min-w-0">
                  <div className="row gap-2 items-center">
                    <h4
                      className={cn(
                        'font-medium text-sm',
                        perk.highlight && 'text-primary',
                      )}
                    >
                      {perk.title}
                    </h4>
                    {perk.highlight && (
                      <CheckIcon className="size-3.5 text-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {perk.description}
                  </p>
                  {perk.href && (
                    <Link
                      href={perk.href}
                      className="text-xs text-primary hover:underline mt-1"
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

      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-muted-foreground text-center">
          Starting at <strong className="text-foreground">$20/month</strong>
        </p>
      </div>
    </div>
  );
}

