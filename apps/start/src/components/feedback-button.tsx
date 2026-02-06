import { op } from '@/utils/op';
import { useRouteContext } from '@tanstack/react-router';
import { SparklesIcon } from 'lucide-react';
import { Button } from './ui/button';

export function FeedbackButton() {
  const context = useRouteContext({ strict: false });
  return (
    <Button
      variant={'outline'}
      className="text-left justify-start text-[13px]"
      icon={SparklesIcon}
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
    >
      Give feedback
    </Button>
  );
}
