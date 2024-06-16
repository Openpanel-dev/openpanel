import { cookies } from 'next/headers';

import { getCurrentOrganizations, getProjectWithClients } from '@openpanel/db';

import OnboardingConnect from './onboarding-connect';

type Props = {
  params: {
    projectId: string;
  };
};

const Connect = async ({ params: { projectId } }: Props) => {
  const orgs = await getCurrentOrganizations();
  const organizationSlug = orgs[0]?.id;
  if (!organizationSlug) {
    throw new Error('No organization found');
  }
  const project = await getProjectWithClients(projectId);

  if (!project) {
    return <div>Hmm, something fishy is going on. Please reload the page.</div>;
  }

  return <OnboardingConnect project={project} />;
};

export default Connect;
