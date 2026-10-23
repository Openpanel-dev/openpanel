import { TriangleAlertIcon } from 'lucide-react';
import { EmptyState, type EmptyStateVariant } from './empty-state';

export const FullPageErrorState = ({
  title = 'Something went wrong',
  description = 'Try again in a moment. If it keeps happening, let us know.',
  children,
  variant = 'page',
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
  /** `inline` when the error sits inside a table or card that is still on screen. */
  variant?: Extract<EmptyStateVariant, 'page' | 'inline'>;
}) => {
  return (
    <EmptyState
      description={description}
      icon={TriangleAlertIcon}
      title={title}
      variant={variant}
    >
      {children}
    </EmptyState>
  );
};
