import { cn } from '@/utils/cn';

export const Grid: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { columns: number }
> = ({ className, columns, children, ...props }) => (
  <div className={cn('card', className)}>
    <div className="relative w-full overflow-auto rounded-md">
      <div
        className={cn('grid w-full')}
        style={{
          gridTemplateColumns: `repeat(${columns}, auto)`,
          width: 'max-content',
          minWidth: '100%',
        }}
        {...props}
      >
        {children}
      </div>
    </div>
  </div>
);

export const GridHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => (
  <div className={cn('contents', className)} {...props}>
    {children}
  </div>
);

export const GridBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => (
  <div
    className={cn('contents [&>*:last-child]:border-0', className)}
    {...props}
  >
    {children}
  </div>
);

export const GridCell: React.FC<
  React.HTMLAttributes<HTMLDivElement> & {
    as?: React.ElementType;
    colSpan?: number;
    isHeader?: boolean;
  }
> = ({
  className,
  children,
  as: Component = 'div',
  colSpan,
  isHeader,
  ...props
}) => (
  <Component
    className={cn(
      'flex min-h-12 items-center whitespace-nowrap px-4 align-middle shadow-[0_0_0_0.5px] shadow-border',
      isHeader && 'h-10 bg-def-100 font-semibold text-muted-foreground',
      colSpan && `col-span-${colSpan}`,
      className,
    )}
    {...props}
  >
    <div className="truncate w-full">{children}</div>
  </Component>
);

export const GridRow: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => (
  <div
    className={cn(
      'contents transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
