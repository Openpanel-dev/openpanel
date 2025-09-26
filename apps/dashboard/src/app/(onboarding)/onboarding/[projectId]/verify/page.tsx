import { cookies } from 'next/headers';
import { escape } from 'sqlstring';

import {
  TABLE_NAMES,
  getEvents,
  getOrganizations,
  getProjectWithClients,
} from '@openpanel/db';

import { auth } from '@openpanel/auth/nextjs';
import OnboardingVerify from './onboarding-verify';

type Props = {
  params: {
    projectId: string;
  };
};

const Verify = async ({ params: { projectId } }: Props) => {
  const { userId } = await auth();
  const orgs = await getOrganizations(userId);
  const organizationId = orgs[0]?.id;
  if (!organizationId) {
    throw new Error('No organization found');
  }
  const [project, events] = await Promise.all([
    await getProjectWithClients(projectId),
    getEvents(
      `SELECT * FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT 100`,
    ),
  ]);

  if (!project) {
    return <div>Hmm, something fishy is going on. Please reload the page.</div>;
  }

  return <OnboardingVerify project={project} events={events.reverse()} />;
};

export default Verify;
