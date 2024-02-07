import { getCurrentProjects } from '@/server/services/project.service';

import LayoutProjectSelector from './layout-project-selector';

interface PageLayoutProps {
  children: React.ReactNode;
  title: React.ReactNode;
}

export default async function PageLayout({ children, title }: PageLayoutProps) {
  const projects = await getCurrentProjects();

  return (
    <>
      <div className="h-16 border-b border-border flex-shrink-0 sticky top-0 bg-white px-4 flex items-center justify-between z-20 pl-12 lg:pl-4">
        <div className="text-xl font-medium">{title}</div>

        {projects.length > 0 && <LayoutProjectSelector projects={projects} />}
      </div>
      <div>{children}</div>
    </>
  );
}
