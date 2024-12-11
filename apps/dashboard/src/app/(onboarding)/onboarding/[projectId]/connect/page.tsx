import { getOrganizations, getProjectWithClients } from '@openpanel/db';

import { auth } from '@openpanel/auth/nextjs';
import OnboardingConnect from './onboarding-connect';

type Props = {
  params: {
    projectId: string;
  };
};

const Connect = async ({ params: { projectId } }: Props) => {
  const { userId } = await auth();
  const orgs = await getOrganizations(userId);
  const organizationId = orgs[0]?.id;
  if (!organizationId) {
    throw new Error('No organization found');
  }
  const project = await getProjectWithClients(projectId);

  if (!project) {
    return <div>Hmm, something fishy is going on. Please reload the page.</div>;
  }

  return <OnboardingConnect project={project} />;
};

export default Connect;
