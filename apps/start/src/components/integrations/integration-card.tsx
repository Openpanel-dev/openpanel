import { Skeleton } from '@/components/skeleton';
import { cn } from '@/utils/cn';
export function IntegrationCardFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('row rounded-b border-t p-4', className)}>
      {children}
    </div>
  );
}

export function IntegrationCardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('row relative rounded-t border-b p-4', className)}>
      {children}
    </div>
  );
}

export function IntegrationCardHeaderButtons({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'row absolute top-0 right-4 bottom-0 items-center gap-2',
        className
      )}
    >
      {children}
    </div>
  );
}

export function IntegrationCardLogoImage({
  src,
  backgroundColor,
  className,
}: {
  src: string;
  backgroundColor: string;
  className?: string;
}) {
  return (
    <IntegrationCardLogo
      className={className}
      style={{
        backgroundColor,
      }}
    >
      <img alt="Integration Logo" src={src} />
    </IntegrationCardLogo>
  );
}

export function IntegrationCardLogo({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'center-center size-14 shrink-0 overflow-hidden rounded',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function IntegrationCard({
  icon,
  name,
  description,
  children,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card self-start">
      <IntegrationCardContent
        description={description}
        icon={icon}
        name={name}
      />
      {children}
    </div>
  );
}

export function IntegrationCardContent({
  icon,
  name,
  description,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
}) {
  return (
    <div className="row gap-4 p-4">
      {icon}
      <div className="col gap-1">
        <h2 className="title">{name}</h2>
        <p className="text-muted-foreground leading-tight">{description}</p>
      </div>
    </div>
  );
}

export function IntegrationCardSkeleton() {
  return (
    <div className="card self-start">
      <div className="row gap-4 p-4">
        <Skeleton className="size-14 shrink-0 rounded" />
        <div className="col flex-grow gap-1">
          <Skeleton className="mb-2 h-5 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </div>
  );
}
