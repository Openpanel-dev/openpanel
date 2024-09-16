import { cn } from '@/utils/cn';

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function Lead({ children, className }: Props) {
  return (
    <p className={cn('text-xl font-light md:text-2xl', className)}>
      {children}
    </p>
  );
}

export function Lead2({ children, className }: Props) {
  return (
    <p className={cn('text-lg font-light md:text-xl', className)}>{children}</p>
  );
}

export function Paragraph({ children, className }: Props) {
  return <p className={cn('text-lg', className)}>{children}</p>;
}

export function Heading1({ children, className }: Props) {
  return (
    <h1
      className={cn(
        'font-serif text-4xl font-bold !leading-tight text-slate-900 md:text-5xl',
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function Heading2({ children, className }: Props) {
  return (
    <h2
      className={cn(
        'font-serif text-4xl font-bold text-slate-900 md:text-5xl',
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Heading3({ children, className }: Props) {
  return (
    <h3
      className={cn(
        'font-serif text-2xl font-bold text-slate-900 md:text-3xl',
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function Heading4({ children, className }: Props) {
  return (
    <h3
      className={cn(
        'font-serif text-xl font-bold text-slate-900 md:text-2xl',
        className,
      )}
    >
      {children}
    </h3>
  );
}
