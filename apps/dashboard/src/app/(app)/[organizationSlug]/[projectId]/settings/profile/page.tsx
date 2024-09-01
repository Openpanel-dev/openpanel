import { Padding } from '@/components/ui/padding';
import { auth } from '@clerk/nextjs/server';

import { getUserById } from '@openpanel/db';

import EditProfile from './edit-profile';

export default async function Page() {
  const { userId } = auth();
  const profile = await getUserById(userId!);

  return (
    <Padding>
      <h1 className="mb-4 text-2xl font-bold">Profile</h1>
      <EditProfile profile={profile} />
    </Padding>
  );
}
