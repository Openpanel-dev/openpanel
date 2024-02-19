import { CreateOrganization } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

import { getCurrentOrganizations } from '@mixan/db';

export default async function Page() {
  const organizations = await getCurrentOrganizations();

  if (organizations.length === 0) {
    return <CreateOrganization />;
  }

  return redirect(`/${organizations[0]?.slug}`);
}
