import withSuspense from '@/hocs/with-suspense';

import type { IServiceProfile } from '@openpanel/db';
import { getProfileMetrics } from '@openpanel/db';

import ProfileMetrics from './profile-metrics';

type Props = {
  projectId: string;
  profile: IServiceProfile;
};

const ProfileMetricsServer = async ({ projectId, profile }: Props) => {
  const data = await getProfileMetrics(profile.id, projectId);
  return <ProfileMetrics data={data} profile={profile} />;
};

export default withSuspense(ProfileMetricsServer, () => null);
