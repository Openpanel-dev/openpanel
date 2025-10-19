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
    <div className={cn('row p-4 border-t rounded-b', className)}>
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
    <div className={cn('relative row p-4 border-b rounded-t', className)}>
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
        'absolute right-4 top-0 bottom-0 row items-center gap-2',
        className,
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
      <img src={src} alt="Integration Logo" />
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
        'size-14 rounded overflow-hidden shrink-0 center-center',
        className,
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
        icon={icon}
        name={name}
        description={description}
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
        <Skeleton className="size-14 rounded shrink-0" />
        <div className="col gap-1 flex-grow">
          <Skeleton className="h-5 w-1/2 mb-2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </div>
  );
}
