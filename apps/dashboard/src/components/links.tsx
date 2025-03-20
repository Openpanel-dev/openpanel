import { useAppParams } from '@/hooks/useAppParams';
import type { LinkProps } from 'next/link';
import Link from 'next/link';

export function ProjectLink({
  children,
  ...props
}: LinkProps & {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const { organizationId, projectId } = useAppParams();
  if (typeof props.href === 'string') {
    return (
      <Link
        {...props}
        href={`/${organizationId}/${projectId}/${props.href.replace(
          /^\//,
          '',
        )}`}
        prefetch
      >
        {children}
      </Link>
    );
  }

  return <p>ProjectLink</p>;
}
