import type { LucideIcon } from 'lucide-react';
import { Loader2Icon } from 'lucide-react';

import { FullPageEmptyState } from './full-page-empty-state';

const FullPageLoadingState = () => {
  return (
    <FullPageEmptyState
      className="min-h-[calc(100vh-theme(spacing.16))]"
      title="Fetching..."
      icon={
        ((props) => (
          <Loader2Icon {...props} className="animate-spin" />
        )) as LucideIcon
      }
    >
      Wait a moment while we fetch your dashboards
    </FullPageEmptyState>
  );
};

export default FullPageLoadingState;
