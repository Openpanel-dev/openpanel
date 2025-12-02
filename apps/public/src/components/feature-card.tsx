import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
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

export const FeatureCardBackground = () => (
  <div
    className={cn(
      'pointer-events-none absolute inset-0 bg-linear-to-br opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100',
      'dark:from-blue-500/10 dark:via-transparent dark:to-emerald-500/5',
      'light:from-blue-800/20 light:via-transparent light:to-emerald-900/10',
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
        'col gap-8 p-6 rounded-3xl border bg-background group relative overflow-hidden',
        className,
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
}: FeatureCardProps) {
  if (illustration) {
    return (
      <FeatureCardContainer className={className}>
        {illustration}
        <div className="col gap-2" data-content>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-muted-foreground">{description}</p>
        </div>
        {children}
      </FeatureCardContainer>
    );
  }

  return (
    <FeatureCardContainer className={className}>
      {Icon && <Icon className="size-6" />}
      <div className="col gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </FeatureCardContainer>
  );
}
