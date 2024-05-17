import { getCurrentOrganizations } from '@openpanel/db';

import OnboardingTracking from './onboarding-tracking';

const Tracking = async () => {
  return <OnboardingTracking organizations={await getCurrentOrganizations()} />;
};

export default Tracking;
