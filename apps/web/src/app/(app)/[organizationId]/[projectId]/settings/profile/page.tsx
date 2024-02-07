import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';
import { getUserById } from '@/server/services/user.service';
import { auth } from '@clerk/nextjs';

import EditProfile from './edit-profile';
import { Logout } from './logout';

interface PageProps {
  params: {
    organizationId: string;
  };
}
export default async function Page({ params: { organizationId } }: PageProps) {
  const { userId } = auth();
  await getExists(organizationId);
  const profile = await getUserById(userId!);

  return (
    <PageLayout title={profile.lastName} organizationSlug={organizationId}>
      <div className="p-4 flex flex-col gap-4">
        <EditProfile profile={profile} />
        <Logout />
      </div>
    </PageLayout>
  );
}
