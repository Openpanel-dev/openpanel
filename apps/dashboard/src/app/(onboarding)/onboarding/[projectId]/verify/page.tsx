import { cookies } from 'next/headers';
import { escape } from 'sqlstring';

import {
  getCurrentOrganizations,
  getEvents,
  getProjectWithClients,
} from '@openpanel/db';

import OnboardingVerify from './onboarding-verify';

type Props = {
  params: {
    projectId: string;
  };
};

const Verify = async ({ params: { projectId } }: Props) => {
  const orgs = await getCurrentOrganizations();
  const organizationSlug = orgs[0]?.slug;
  if (!organizationSlug) {
    throw new Error('No organization found');
  }
  const [project, events] = await Promise.all([
    await getProjectWithClients(projectId),
    getEvents(
      `SELECT * FROM events WHERE project_id = ${escape(projectId)} LIMIT 100`
    ),
  ]);
  const clientSecret = cookies().get('onboarding_client_secret')?.value ?? null;

  if (!project) {
    return <div>Hmm, something fishy is going on. Please reload the page.</div>;
  }

  // set visible client secret from cookie
  if (clientSecret && project.clients[0]) {
    project.clients[0].secret = clientSecret;
  }

  return <OnboardingVerify project={project} events={events} />;
};

export default Verify;
