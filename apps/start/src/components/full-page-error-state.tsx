import { ServerCrashIcon } from 'lucide-react';

import { FullPageEmptyState } from './full-page-empty-state';

export const FullPageErrorState = ({
  title = 'Error...',
  description = 'Something went wrong...',
  children,
}: { title?: string; description?: string; children?: React.ReactNode }) => {
  return (
    <FullPageEmptyState
      className="min-h-[calc(100vh-theme(spacing.16))]"
      title={title}
      icon={ServerCrashIcon}
    >
      {description}
      {children && <div className="mt-4">{children}</div>}
    </FullPageEmptyState>
  );
};
