import PageLayout from '@/app/(app)/page-layout';
import { getUserById } from '@/server/services/user.service';
import { auth } from '@clerk/nextjs';

import EditProfile from './edit-profile';
import { Logout } from './logout';

export default async function Page() {
  const { userId } = auth();
  const profile = await getUserById(userId!);

  return (
    <PageLayout title={profile.lastName}>
      <div className="p-4 flex flex-col gap-4">
        <EditProfile profile={profile} />
        <Logout />
      </div>
    </PageLayout>
  );
}
