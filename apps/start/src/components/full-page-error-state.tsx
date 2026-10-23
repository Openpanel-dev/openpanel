import { TriangleAlertIcon } from 'lucide-react';
import { EmptyState } from './empty-state';

export const FullPageErrorState = ({
  title = 'Something went wrong',
  description = 'Try again in a moment. If it keeps happening, let us know.',
  children,
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}) => {
  return (
    <EmptyState
      description={description}
      icon={TriangleAlertIcon}
      title={title}
      variant="page"
    >
      {children}
    </EmptyState>
  );
};
