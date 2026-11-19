import { useRouteContext } from '@tanstack/react-router';
import { op } from '@/utils/op';

const PUBLIC_FEEDBACK_URL = 'https://feedback.openpanel.dev';

export function FeedbackButton({
  className,
  children = 'Give feedback',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const context = useRouteContext({ strict: false });

  // The widget is not loaded on a self-hosted install.
  if (context.isSelfHosted !== false) {
    return (
      <a
        className={className}
        href={PUBLIC_FEEDBACK_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className={className}
      onClick={() => {
        op.track('feedback_button_clicked');
        if ('uj' in window && window.uj !== undefined) {
          (window as any).uj.identify({
            id: context.session?.userId,
            firstName: context.session?.user?.firstName,
            email: context.session?.user?.email,
          });
          setTimeout(() => {
            (window as any).uj.showWidget();
          }, 10);
        }
      }}
      type="button"
    >
      {children}
    </button>
  );
}
