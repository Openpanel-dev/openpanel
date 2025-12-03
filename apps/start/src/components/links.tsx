import { useAppParams } from '@/hooks/use-app-params';
import { Link, type LinkComponentProps } from '@tanstack/react-router';
import { omit } from 'ramda';

export function ProjectLink({
  children,
  ...props
}: LinkComponentProps & {
  children: React.ReactNode;
  className?: string;
  title?: string;
  exact?: boolean;
}) {
  const { organizationId, projectId } = useAppParams();
  if (typeof props.href === 'string') {
    return (
      <Link
        to={
          `/$organizationId/$projectId/${props.href.replace(/^\//, '')}` as any
        }
        activeOptions={{ exact: props.exact ?? true }}
        params={
          {
            organizationId,
            projectId,
          } as any
        }
        {...omit(['href'], props)}
      >
        {children}
      </Link>
    );
  }

  return <p>ProjectLink</p>;
}
