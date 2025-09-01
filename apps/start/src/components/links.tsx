import { useAppParams } from '@/hooks/use-app-params';
import { Link, type LinkComponentProps } from '@tanstack/react-router';

export function ProjectLink({
  children,
  ...props
}: LinkComponentProps & {
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
      >
        {children}
      </Link>
    );
  }

  return <p>ProjectLink</p>;
}
