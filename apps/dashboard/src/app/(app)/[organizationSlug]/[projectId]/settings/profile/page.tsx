import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { auth } from '@clerk/nextjs/server';

import { getUserById } from '@openpanel/db';

import EditProfile from './edit-profile';
import { Logout } from './logout';

interface PageProps {
  params: {
    organizationSlug: string;
  };
}
export default async function Page({
  params: { organizationSlug },
}: PageProps) {
  const { userId } = auth();
  const profile = await getUserById(userId!);

  return (
    <>
      <PageLayout
        title={profile.lastName}
        organizationSlug={organizationSlug}
      />
      <div className="flex flex-col gap-4 p-4">
        <EditProfile profile={profile} />
        <Logout />
      </div>
    </>
  );
}
