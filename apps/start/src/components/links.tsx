import { useAppParams } from '@/hooks/use-app-params';
import { Link, type LinkComponentProps } from '@tanstack/react-router';

type ProjectLinkBaseProps = Omit<
  LinkComponentProps,
  'to' | 'href' | 'params'
> & {
  children: React.ReactNode;
  className?: string;
  title?: string;
  exact?: boolean;
};

/**
 * `href` is a project-relative pathname whose segments are already final
 * (`/profiles`, `/settings`). Use it for static links only — an id
 * interpolated here becomes a literal path segment, so it breaks on any id
 * containing `/`, `#` or `?`.
 *
 * `to` is a project-relative route template whose dynamic segments are filled
 * from `params` (`to="/profiles/$profileId"`). The router encodes each param
 * exactly once, so this is the safe form for anything id-shaped. Never hand a
 * pre-encoded value to `params` — that is what produced `%2540` in the URL for
 * email-identified profiles.
 */
type ProjectLinkProps = ProjectLinkBaseProps &
  (
    | { href: string; to?: never; params?: never }
    | { to: string; params?: Record<string, string>; href?: never }
  );

export function ProjectLink({
  children,
  exact,
  to,
  href,
  params,
  ...rest
}: ProjectLinkProps) {
  const { organizationId, projectId } = useAppParams();
  const path = to ?? href;

  if (typeof path !== 'string') {
    return <p>ProjectLink</p>;
  }

  return (
    <Link
      {...rest}
      to={`/$organizationId/$projectId/${path.replace(/^\//, '')}` as any}
      params={{ organizationId, projectId, ...params } as any}
      activeOptions={{ exact: exact ?? true }}
    >
      {children}
    </Link>
  );
}
