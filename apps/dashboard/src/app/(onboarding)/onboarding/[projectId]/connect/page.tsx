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
  const organizationSlug = orgs[0]?.slug;
  if (!organizationSlug) {
    throw new Error('No organization found');
  }
  const project = await getProjectWithClients(projectId);
  const clientSecret = cookies().get('onboarding_client_secret')?.value ?? null;

  if (!project) {
    return <div>Hmm, something fishy is going on. Please reload the page.</div>;
  }

  // set visible client secret from cookie
  if (clientSecret && project.clients[0]) {
    project.clients[0].secret = clientSecret;
  }

  return <OnboardingConnect project={project} />;
};

export default Connect;
