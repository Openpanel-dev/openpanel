import withLoadingWidget from '@/hocs/with-loading-widget';

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

export default withLoadingWidget(ProfileMetricsServer);
