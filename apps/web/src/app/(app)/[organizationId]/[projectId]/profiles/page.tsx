import PageLayout from '@/app/(app)/page-layout';

import { ListProfiles } from './list-profiles';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}
export default function Page({
  params: { organizationId, projectId },
}: PageProps) {
  return (
    <PageLayout title="Events" organizationId={organizationId}>
      <ListProfiles projectId={projectId} organizationId={organizationId} />
    </PageLayout>
  );
}
