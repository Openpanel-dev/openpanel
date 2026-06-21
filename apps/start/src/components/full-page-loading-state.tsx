import type { LucideIcon } from 'lucide-react';
import { Loader2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { FullPageEmptyState } from './full-page-empty-state';

const FullPageLoadingState = ({
  title,
  description,
}: { title?: string; description?: string }) => {
  const { t } = useTranslation();

  return (
    <FullPageEmptyState
      className="min-h-[calc(100vh-theme(spacing.16))]"
      title={title ?? t('ui.fetching')}
      description={description ?? t('ui.fetching_description')}
      icon={
        ((props) => (
          <Loader2Icon {...props} className="animate-spin" />
        )) as LucideIcon
      }
    />
  );
};

export default FullPageLoadingState;
