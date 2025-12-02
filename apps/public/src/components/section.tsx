import { cn } from '@/lib/utils';

export function Section({
  children,
  className,
  id,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('my-32 col', className)} {...props}>
      {children}
    </section>
  );
}

const variants = {
  default: 'text-3xl md:text-5xl font-semibold',
  sm: 'text-3xl md:text-4xl font-semibold',
};

export function SectionHeader({
  label,
  title,
  description,
  className,
  align,
  as = 'h2',
  variant = 'default',
}: {
  label?: string;
  title: string | React.ReactNode;
  description?: string;
  className?: string;
  align?: 'center' | 'left';
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  variant?: keyof typeof variants;
}) {
  const Heading = as;
  return (
    <div
      className={cn(
        'col gap-4',
        align === 'center'
          ? 'center-center text-center'
          : 'items-start text-left',
        className,
      )}
    >
      {label && <SectionLabel>{label}</SectionLabel>}
      <Heading className={cn(variants[variant], 'max-w-3xl leading-tight')}>
        {title}
      </Heading>
      {description && (
        <p className={cn('text-muted-foreground max-w-3xl')}>{description}</p>
      )}
    </div>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-xs uppercase tracking-wider text-muted-foreground font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}
