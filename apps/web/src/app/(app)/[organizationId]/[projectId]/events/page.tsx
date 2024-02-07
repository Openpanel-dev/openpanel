import PageLayout from '@/app/(app)/page-layout';

import { ListEvents } from './list-events';

interface PageProps {
  params: {
    projectId: string;
  };
}
export default function Page({ params: { projectId } }: PageProps) {
  return (
    <PageLayout title="Events">
      <ListEvents projectId={projectId} />
    </PageLayout>
  );
}
