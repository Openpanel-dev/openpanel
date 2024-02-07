import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';

import { ListEvents } from './list-events';

interface PageProps {
  params: {
    projectId: string;
    organizationId: string;
  };
}
export default async function Page({
  params: { projectId, organizationId },
}: PageProps) {
  await getExists(organizationId, projectId);

  return (
    <PageLayout title="Events" organizationSlug={organizationId}>
      <ListEvents projectId={projectId} />
    </PageLayout>
  );
}
