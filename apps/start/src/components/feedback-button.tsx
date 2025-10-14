import { op } from '@/utils/op';
import { useLocation, useRouteContext } from '@tanstack/react-router';
import { SparklesIcon } from 'lucide-react';
import { Button } from './ui/button';

export function FeedbackButton() {
  const context = useRouteContext({ strict: false });
  return (
    <Button
      variant={'outline'}
      className="w-full text-left justify-start [&_svg]:mx-2"
      icon={SparklesIcon}
      onClick={() => {
        op.track('feedback_button_clicked');
        if ('uj' in window) {
          (window.uj as any).identify({
            id: context.session?.userId,
            firstName: context.session?.user?.firstName,
          });
          (window.uj as any).showWidget();
        }
      }}
    >
      Give feedback
    </Button>
  );
}
