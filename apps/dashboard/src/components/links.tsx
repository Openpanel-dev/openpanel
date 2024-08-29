import { useAppParams } from '@/hooks/useAppParams';
import type { LinkProps } from 'next/link';
import Link from 'next/link';

export function ProjectLink({
  children,
  ...props
}: LinkProps & { children: React.ReactNode; className?: string }) {
  const { organizationSlug, projectId } = useAppParams();
  if (typeof props.href === 'string') {
    return (
      <Link {...props} href={`/${organizationSlug}/${projectId}/${props.href}`}>
        {children}
      </Link>
    );
  }

  return <p>ProjectLink</p>;
}
