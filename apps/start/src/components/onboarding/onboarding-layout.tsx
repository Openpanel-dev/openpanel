import { cn } from '@/lib/utils';

type Props = {
  children: React.ReactNode;
  className?: string;
  title: string;
  description?: React.ReactNode;
};

export const OnboardingDescription = ({
  children,
  className,
}: Pick<Props, 'children' | 'className'>) => (
  <div
    className={cn(
      'font-medium text-muted-foreground leading-normal [&_a]:underline [&_a]:font-semibold',
      className,
    )}
  >
    {children}
  </div>
);

export const OnboardingLayout = ({
  title,
  description,
  children,
  className,
}: Props) => {
  return (
    <div className={cn('flex max-w-3xl flex-col gap-4', className)}>
      <div className="mb-4">
        <h1 className="mb-2 text-3xl font-medium">{title}</h1>
        {description}
      </div>

      {children}
    </div>
  );
};
