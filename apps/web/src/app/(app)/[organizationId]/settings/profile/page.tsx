import PageLayout from '@/app/(app)/page-layout';
import { getSession } from '@/server/auth';
import { getUserById } from '@/server/services/user.service';

import EditProfile from './edit-profile';
import { Logout } from './logout';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const session = await getSession();
  const profile = await getUserById(session?.user.id!);

  return (
    <PageLayout title={profile.name} organizationId={organizationId}>
      <div className="p-4 flex flex-col gap-4">
        <EditProfile profile={profile} />
        <Logout />
      </div>
    </PageLayout>
  );
}
