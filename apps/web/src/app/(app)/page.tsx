import { getCurrentOrganizations } from '@/server/services/organization.service';
import { CreateOrganization } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

export default async function Page() {
  const organizations = await getCurrentOrganizations();

  if (organizations.length === 0) {
    return <CreateOrganization />;
  }

  return redirect(`/${organizations[0]?.slug}`);
}
