import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircleIcon } from 'lucide-react';

import PageLayout from '../page-layout';
import LastActiveUsersServer from './last-active-users';
import RollingActiveUsers from './rolling-active-users';
import UsersRetentionSeries from './users-retention-series';
import WeeklyCohortsServer from './weekly-cohorts';

type Props = {
  params: {
    organizationSlug: string;
    projectId: string;
  };
};

const Retention = ({ params: { projectId, organizationSlug } }: Props) => {
  return (
    <>
      <PageLayout title="Retention" organizationSlug={organizationSlug} />
      <div className="flex flex-col gap-8 p-8">
        <Alert>
          <AlertCircleIcon size={18} />
          <AlertTitle>Experimental feature</AlertTitle>
          <AlertDescription>
            <p>
              This page is an experimental feature and we&apos;ll be working
              hard to make it even better. Stay tuned!
            </p>
            <p>
              Please DM me on{' '}
              <a
                href="https://go.openpanel.dev/discord"
                className="font-medium underline"
              >
                Discord
              </a>{' '}
              or{' '}
              <a
                href="https://twitter.com/CarlLindesvard"
                className="font-medium underline"
              >
                X/Twitter
              </a>{' '}
              if you notice any issues.
            </p>
          </AlertDescription>
        </Alert>
        <RollingActiveUsers projectId={projectId} />
        <Alert>
          <AlertCircleIcon size={18} />
          <AlertTitle>Retention info</AlertTitle>
          <AlertDescription>
            This information is only relevant if you supply a user ID to the
            SDK!
          </AlertDescription>
        </Alert>
        <LastActiveUsersServer projectId={projectId} />
        <UsersRetentionSeries projectId={projectId} />
        <WeeklyCohortsServer projectId={projectId} />
      </div>
    </>
  );
};

export default Retention;
