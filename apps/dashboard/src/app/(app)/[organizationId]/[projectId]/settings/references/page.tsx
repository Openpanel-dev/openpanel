import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';

import { getReferences } from '@openpanel/db';

import ListReferences from './list-references';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}

export default async function Page({
  params: { organizationId, projectId },
}: PageProps) {
  const references = await getReferences({
    where: {
      projectId,
    },
    take: 50,
    skip: 0,
  });

  return (
    <PageLayout title="References" organizationSlug={organizationId}>
      <ListReferences data={references} />
    </PageLayout>
  );
}
