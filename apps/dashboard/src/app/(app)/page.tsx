// import { CreateOrganization } from '@clerk/nextjs';

import { LogoSquare } from '@/components/logo';
import { redirect } from 'next/navigation';

import { getCurrentOrganizations, isWaitlistUserAccepted } from '@openpanel/db';

import { CreateOrganization } from './create-organization';

export default async function Page() {
  const organizations = await getCurrentOrganizations();
  if (process.env.BLOCK) {
    const isAccepted = await isWaitlistUserAccepted();
    if (!isAccepted) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="w-full max-w-lg">
            <LogoSquare className="mb-8 w-20 md:w-28" />
            <h1 className="text-3xl font-medium">Not quite there yet</h1>
            <div className="text-lg">
              We're still working on Openpanel, but we're not quite there yet.
              We'll let you know when we're ready to go!
            </div>
          </div>
        </div>
      );
    }
  }

  if (organizations.length > 0) {
    return redirect(`/${organizations[0]?.slug}`);
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-full max-w-lg">
        <CreateOrganization />
      </div>
    </div>
  );
}
