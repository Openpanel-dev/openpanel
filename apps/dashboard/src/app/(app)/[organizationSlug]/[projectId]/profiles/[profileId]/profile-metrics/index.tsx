import withSuspense from '@/hocs/with-suspense';

import { getProfileMetrics } from '@openpanel/db';

import ProfileMetrics from './profile-metrics';

type Props = {
  projectId: string;
  profileId: string;
};

const ProfileMetricsServer = async ({ projectId, profileId }: Props) => {
  const data = await getProfileMetrics(profileId, projectId);
  return <ProfileMetrics data={data} />;
};

export default withSuspense(ProfileMetricsServer, () => null);
