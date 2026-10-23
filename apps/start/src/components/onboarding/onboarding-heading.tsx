import { cn } from '@/utils/cn';

export function OnboardingHeading({
  title,
  description,
  className,
}: {
  title: string;
  description: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('col gap-3', className)}>
      <h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
      <p className="max-w-prose text-base text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
