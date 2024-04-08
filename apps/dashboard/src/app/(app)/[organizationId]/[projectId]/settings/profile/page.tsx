import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { auth } from '@clerk/nextjs';

import { getUserById } from '@openpanel/db';

import EditProfile from './edit-profile';
import { Logout } from './logout';

interface PageProps {
  params: {
    organizationId: string;
  };
}
export default async function Page({
  params: { organizationId: organizationSlug },
}: PageProps) {
  const { userId } = auth();
  const profile = await getUserById(userId!);

  return (
    <PageLayout title={profile.lastName} organizationSlug={organizationSlug}>
      <div className="flex flex-col gap-4 p-4">
        <EditProfile profile={profile} />
        <Logout />
      </div>
    </PageLayout>
  );
}
