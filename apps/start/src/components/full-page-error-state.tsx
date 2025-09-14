import { ServerCrashIcon } from 'lucide-react';

import { FullPageEmptyState } from './full-page-empty-state';

export const FullPageErrorState = ({
  title = 'Error...',
  description = 'Something went wrong...',
}: { title?: string; description?: string }) => {
  return (
    <FullPageEmptyState
      className="min-h-[calc(100vh-theme(spacing.16))]"
      title={title}
      icon={ServerCrashIcon}
    >
      {description}
    </FullPageEmptyState>
  );
};
