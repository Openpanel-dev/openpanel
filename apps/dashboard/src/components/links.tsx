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
  const { organizationSlug, projectId } = useAppParams();
  if (typeof props.href === 'string') {
    return (
      <Link
        {...props}
        href={`/${organizationSlug}/${projectId}/${props.href.replace(
          /^\//,
          '',
        )}`}
      >
        {children}
      </Link>
    );
  }

  return <p>ProjectLink</p>;
}
