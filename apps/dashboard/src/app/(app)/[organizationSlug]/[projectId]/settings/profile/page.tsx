import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { auth } from '@clerk/nextjs/server';

import { getUserById } from '@openpanel/db';

import EditProfile from './edit-profile';
import { Logout } from './logout';

export default async function Page() {
  const { userId } = auth();
  const profile = await getUserById(userId!);

  return (
    <>
      <PageLayout title={profile.lastName} />
      <div className="flex flex-col gap-4 p-4">
        <EditProfile profile={profile} />
        <Logout />
      </div>
    </>
  );
}
