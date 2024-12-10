import { getCurrentOrganizations } from '@openpanel/db';
import { OnboardingCreateProject } from './onboarding-create-project';

const Page = async () => {
  return (
    <OnboardingCreateProject organizations={await getCurrentOrganizations()} />
  );
};

export default Page;
