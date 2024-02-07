import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';

import { ListProfiles } from './list-profiles';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}
export default async function Page({
  params: { organizationId, projectId },
}: PageProps) {
  await getExists(organizationId, projectId);

  return (
    <PageLayout title="Events" organizationSlug={organizationId}>
      <ListProfiles projectId={projectId} organizationId={organizationId} />
    </PageLayout>
  );
}
