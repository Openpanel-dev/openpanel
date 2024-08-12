import { cn } from '@/utils/cn';

const padding = 'p-4 md:p-8';

export const Padding = ({
  className,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) => {
  return <div className={cn(padding, className)} {...props} />;
};

export const Spacer = ({
  className,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) => {
  return <div className={cn('h-8', className)} {...props} />;
};
