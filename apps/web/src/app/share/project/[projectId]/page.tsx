import OverviewMetrics from '@/app/(app)/[organizationId]/[projectId]/overview-metrics';
import { Logo } from '@/components/Logo';
import { getOrganizationByProjectId } from '@/server/services/organization.service';
import { getProjectById } from '@/server/services/project.service';

interface PageProps {
  params: {
    projectId: string;
  };
}

export default async function Page({ params: { projectId } }: PageProps) {
  const project = await getProjectById(projectId);
  const organization = await getOrganizationByProjectId(projectId);
  return (
    <div className="p-4 md:p-16 bg-gradient-to-tl from-blue-950 to-blue-600">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-4">
          <div className="leading-none">
            <span className="text-white mb-4">{organization?.name}</span>
            <h1 className="text-white text-xl font-medium">{project?.name}</h1>
          </div>
          <a href="https://openpanel.dev?utm_source=openpanel.dev&utm_medium=share">
            <Logo className="text-white" />
          </a>
        </div>
        <div className="bg-white rounded-lg shadow">
          <OverviewMetrics />
        </div>
      </div>
    </div>
  );
}
