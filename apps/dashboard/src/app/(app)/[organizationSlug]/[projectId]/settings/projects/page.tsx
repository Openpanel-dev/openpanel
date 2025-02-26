import { Padding } from '@/components/ui/padding';

import {
  db,
  getClientsByOrganizationId,
  getProjectWithClients,
  getProjectsByOrganizationId,
} from '@openpanel/db';

import { notFound } from 'next/navigation';
import DeleteProject from './delete-project';
import EditProjectDetails from './edit-project-details';
import EditProjectFilters from './edit-project-filters';
import ProjectClients from './project-clients';

interface PageProps {
  params: {
    projectId: string;
  };
}

export default async function Page({ params: { projectId } }: PageProps) {
  const project = await getProjectWithClients(projectId);

  if (!project) {
    notFound();
  }

  return (
    <Padding>
      <div className="col gap-4">
        <div className="row justify-between items-center">
          <h1 className="text-2xl font-bold">{project.name}</h1>
        </div>
        <EditProjectDetails project={project} />
        <EditProjectFilters project={project} />
        <ProjectClients project={project} />
        <DeleteProject project={project} />
      </div>
    </Padding>
  );
}
