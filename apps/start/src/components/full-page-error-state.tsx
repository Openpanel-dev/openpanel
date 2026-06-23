import { ServerCrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { FullPageEmptyState } from './full-page-empty-state';

export const FullPageErrorState = ({
  title,
  description,
  children,
}: { title?: string; description?: string; children?: React.ReactNode }) => {
  const { t } = useTranslation();

  return (
    <FullPageEmptyState
      className="min-h-[calc(100vh-theme(spacing.16))]"
      title={title ?? t('ui.error_title')}
      icon={ServerCrashIcon}
    >
      {description ?? t('ui.error_description')}
      {children && <div className="mt-4">{children}</div>}
    </FullPageEmptyState>
  );
};
