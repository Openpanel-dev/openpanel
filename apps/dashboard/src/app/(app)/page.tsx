import { redirect } from 'next/navigation';

import { auth } from '@openpanel/auth/nextjs';
import { getOrganizations } from '@openpanel/db';

export default async function Page() {
  const { userId } = await auth();
  const organizations = await getOrganizations(userId);

  if (organizations.length > 0) {
    return redirect(`/${organizations[0]?.id}`);
  }

  return redirect('/onboarding/project');
}
