import { auth } from '@openpanel/auth/nextjs';
import { getOrganizations } from '@openpanel/db';
import { OnboardingCreateProject } from './onboarding-create-project';

const Page = async () => {
  const { userId } = await auth();
  const organizations = await getOrganizations(userId);
  return <OnboardingCreateProject organizations={organizations} />;
};

export default Page;
