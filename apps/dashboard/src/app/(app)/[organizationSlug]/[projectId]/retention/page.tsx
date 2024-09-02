import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Padding } from '@/components/ui/padding';
import { AlertCircleIcon } from 'lucide-react';

import LastActiveUsersServer from './last-active-users';
import RollingActiveUsers from './rolling-active-users';
import UsersRetentionSeries from './users-retention-series';
import WeeklyCohortsServer from './weekly-cohorts';

type Props = {
  params: {
    projectId: string;
  };
};

const Retention = ({ params: { projectId } }: Props) => {
  return (
    <Padding>
      <h1 className="mb-4 text-3xl font-semibold">Retention</h1>
      <div className="flex max-w-6xl flex-col gap-8">
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
                href="https://x.com/OpenPanelDev"
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
    </Padding>
  );
};

export default Retention;
