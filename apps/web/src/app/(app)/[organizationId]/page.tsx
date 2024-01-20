import { getFirstProjectByOrganizationId } from '@/server/services/project.service';
import { redirect } from 'next/navigation';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const project = await getFirstProjectByOrganizationId(organizationId);
  if (project) {
    return redirect(`/${organizationId}/${project.id}`);
  }

  return <p>List projects maybe?</p>;
}
