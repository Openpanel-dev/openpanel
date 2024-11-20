import { getReferences } from '@openpanel/db';

import ListReferences from './list-references';

interface PageProps {
  params: {
    projectId: string;
  };
}

export default async function Page({ params: { projectId } }: PageProps) {
  const references = await getReferences({
    where: {
      projectId,
    },
    take: 50,
    skip: 0,
  });

  return (
    <>
      <ListReferences data={references} />
    </>
  );
}
