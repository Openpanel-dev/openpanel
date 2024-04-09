import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';

import { getReferences } from '@openpanel/db';

import ListReferences from './list-references';

interface PageProps {
  params: {
    organizationSlug: string;
    projectId: string;
  };
}

export default async function Page({
  params: { organizationSlug, projectId },
}: PageProps) {
  const references = await getReferences({
    where: {
      projectId,
    },
    take: 50,
    skip: 0,
  });

  return (
    <PageLayout title="References" organizationSlug={organizationSlug}>
      <ListReferences data={references} />
    </PageLayout>
  );
}
