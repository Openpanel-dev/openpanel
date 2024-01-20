import PageLayout from '@/app/(app)/page-layout';

import { ListEvents } from './list-events';

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
      <ListEvents projectId={projectId} />
    </PageLayout>
  );
}
