import { cookies } from 'next/headers';
import { escape } from 'sqlstring';

import {
  getCurrentOrganizations,
  getEvents,
  getProjectWithClients,
  TABLE_NAMES,
} from '@openpanel/db';

import OnboardingVerify from './onboarding-verify';

type Props = {
  params: {
    projectId: string;
  };
};

const Verify = async ({ params: { projectId } }: Props) => {
  const orgs = await getCurrentOrganizations();
  const organizationSlug = orgs[0]?.id;
  if (!organizationSlug) {
    throw new Error('No organization found');
  }
  const [project, events] = await Promise.all([
    await getProjectWithClients(projectId),
    getEvents(
      `SELECT * FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)} LIMIT 100`
    ),
  ]);

  if (!project) {
    return <div>Hmm, something fishy is going on. Please reload the page.</div>;
  }

  return <OnboardingVerify project={project} events={events} />;
};

export default Verify;
