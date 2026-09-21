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
    <section className={cn('col my-32', className)} id={id} {...props}>
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
  description?: string | React.ReactNode;
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
        className
      )}
    >
      {label && <SectionLabel>{label}</SectionLabel>}
      <Heading className={cn(variants[variant], 'max-w-3xl leading-tight')}>
        {title}
      </Heading>
      {description && (
        <p className={cn('max-w-3xl text-muted-foreground')}>{description}</p>
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
        'font-medium text-muted-foreground text-xs uppercase tracking-wider',
        className
      )}
    >
      {children}
    </span>
  );
}
