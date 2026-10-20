import { useRouteContext } from '@tanstack/react-router';
import { op } from '@/utils/op';

export function FeedbackButton({ className }: { className?: string }) {
  const context = useRouteContext({ strict: false });
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
      Give feedback
    </button>
  );
}
