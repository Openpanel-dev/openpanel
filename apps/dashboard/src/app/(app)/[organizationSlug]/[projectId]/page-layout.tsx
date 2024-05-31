import DarkModeToggle from '@/components/dark-mode-toggle';
import withSuspense from '@/hocs/with-suspense';

import { getCurrentProjects } from '@openpanel/db';

import LayoutProjectSelector from './layout-project-selector';

interface PageLayoutProps {
  title: React.ReactNode;
  organizationSlug: string;
}

async function PageLayout({ title, organizationSlug }: PageLayoutProps) {
  const projects = await getCurrentProjects(organizationSlug);

  return (
    <>
      <div className="sticky top-0 z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-card px-4 pl-12 lg:pl-4">
        <div className="text-xl font-medium">{title}</div>
        <div className="flex gap-2">
          <div>
            <DarkModeToggle className="hidden sm:flex" />
          </div>
          {projects.length > 0 && <LayoutProjectSelector projects={projects} />}
        </div>
      </div>
    </>
  );
}

const Loading = ({ title }: PageLayoutProps) => (
  <>
    <div className="sticky top-0 z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-card px-4 pl-12 lg:pl-4">
      <div className="text-xl font-medium">{title}</div>
    </div>
  </>
);

export default withSuspense(PageLayout, Loading);
