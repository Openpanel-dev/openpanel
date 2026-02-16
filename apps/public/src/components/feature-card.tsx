import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface FeatureCardProps {
  link?: {
    href: string;
    children: React.ReactNode;
  };
  illustration?: React.ReactNode;
  title: string;
  description: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'large';
}

interface FeatureCardContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const FeatureCardBackground = ({
  interactive = true,
}: {
  interactive?: boolean;
}) => (
  <div
    className={cn(
      'pointer-events-none absolute inset-0 bg-linear-to-br opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100',
      'dark:from-blue-500/20 dark:via-transparent dark:to-emerald-500/10',
      'light:from-blue-800/20 light:via-transparent light:to-emerald-900/10',
      interactive === false && 'opacity-100'
    )}
  />
);

export function FeatureCardContainer({
  children,
  className,
}: FeatureCardContainerProps) {
  return (
    <div
      className={cn(
        'col group relative gap-8 overflow-hidden rounded-3xl border bg-background p-6',
        className
      )}
    >
      <FeatureCardBackground />
      {children}
    </div>
  );
}

export function FeatureCard({
  illustration,
  title,
  description,
  icon: Icon,
  children,
  className,
  link,
}: FeatureCardProps) {
  if (illustration) {
    return (
      <FeatureCardContainer className={className}>
        {illustration}
        <div className="col gap-2" data-content>
          <h3 className="font-semibold text-xl">{title}</h3>
          <p className="text-muted-foreground">{description}</p>
        </div>
        {children}
        {link && (
          <Link
            className="mx-6 text-muted-foreground text-sm transition-colors hover:text-primary"
            href={link.href}
          >
            {link.children}
          </Link>
        )}
      </FeatureCardContainer>
    );
  }

  return (
    <FeatureCardContainer className={className}>
      {Icon && <Icon className="size-6" />}
      <div className="col gap-2">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
      {link && (
        <Link
          className="text-muted-foreground text-sm transition-colors hover:text-primary"
          href={link.href}
        >
          {link.children}
        </Link>
      )}
    </FeatureCardContainer>
  );
}
