import { redirect } from 'next/navigation';

import { getCurrentOrganizations } from '@openpanel/db';

export default async function Page() {
  const organizations = await getCurrentOrganizations();

  if (organizations.length > 0) {
    return redirect(`/${organizations[0]?.slug}`);
  }

  return redirect('/onboarding');
}
