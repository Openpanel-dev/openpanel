import type { LucideIcon } from 'lucide-react';
import { Loader2Icon } from 'lucide-react';

import { FullPageEmptyState } from './full-page-empty-state';

const FullPageLoadingState = ({
  title = 'Fetching...',
  description = 'Please wait while we fetch your data...',
}: { title?: string; description?: string }) => {
  return (
    <FullPageEmptyState
      className="min-h-[calc(100vh-theme(spacing.16))]"
      title={title}
      icon={
        ((props) => (
          <Loader2Icon {...props} className="animate-spin" />
        )) as LucideIcon
      }
    >
      {description}
    </FullPageEmptyState>
  );
};

export default FullPageLoadingState;
