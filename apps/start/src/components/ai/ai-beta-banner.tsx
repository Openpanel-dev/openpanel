import {
  BookOpenIcon,
  FlaskConicalIcon,
  MessageSquareIcon,
} from 'lucide-react';
import { FeedbackButton } from '@/components/feedback-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/utils/cn';

export const AI_DOCS_URL = 'https://openpanel.dev/docs/ai-observability';

const ACTION_CLASS =
  'row h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 font-medium text-foreground text-xs transition-colors hover:bg-def-100';

/**
 * Shown on every AI page while the feature is in beta: the payload and the
 * pages may still change, and feedback is what decides how.
 */
export function AiBetaBanner({ className }: { className?: string }) {
  return (
    <Alert className={cn('border-chart-0/40 bg-chart-0/5', className)}>
      <FlaskConicalIcon className="size-4" />
      <AlertTitle>AI observability is in beta</AlertTitle>
      <AlertDescription className="col gap-3 text-muted-foreground">
        <p>
          We are shaping this with the people who use it. How events are sent
          and what these pages show may change before it is final, but events
          you have already sent stay readable. Tell us what you are trying to
          learn about your AI features and what is missing.
        </p>
        <div className="row flex-wrap gap-2">
          <FeedbackButton className={ACTION_CLASS}>
            <MessageSquareIcon className="size-3.5" />
            Give feedback
          </FeedbackButton>
          <a
            className={ACTION_CLASS}
            href={AI_DOCS_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <BookOpenIcon className="size-3.5" />
            Read the docs
          </a>
        </div>
      </AlertDescription>
    </Alert>
  );
}
