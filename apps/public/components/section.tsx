import { cn } from '@/lib/utils';

export function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn('my-32 col', className)}>{children}</section>;
}

export function SectionHeader({
  tag,
  title,
  description,
  className,
}: {
  tag?: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn('col gap-4 center-center mb-16', className)}>
      {tag}
      <h2 className="text-4xl font-medium">{title}</h2>
      <p className="text-muted-foreground max-w-screen-sm">{description}</p>
    </div>
  );
}
