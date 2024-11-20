import { cookies } from 'next/headers';
import { escape } from 'sqlstring';

import {
  TABLE_NAMES,
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
  const organizationId = orgs[0]?.id;
  if (!organizationId) {
    throw new Error('No organization found');
  }
  const [project, events] = await Promise.all([
    await getProjectWithClients(projectId),
    getEvents(
      `SELECT * FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)} LIMIT 100`,
    ),
  ]);

  if (!project) {
    return <div>Hmm, something fishy is going on. Please reload the page.</div>;
  }

  return <OnboardingVerify project={project} events={events} />;
};

export default Verify;
