import { Markdown } from '@/components/markdown';
import { cn } from '@/utils/cn';
import { zChartInputAI } from '@openpanel/validation';
import type { UIMessage } from 'ai';
import { Loader2Icon, UserIcon } from 'lucide-react';
import { Fragment, memo } from 'react';
import { Card } from '../card';
import { LogoSquare } from '../logo';
import { Skeleton } from '../skeleton';
import Syntax from '../syntax';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';
import { ChatReport } from './chat-report';

export const ChatMessage = memo(
  ({
    message,
    isLast,
    isStreaming,
    debug,
  }: {
    message: UIMessage;
    isLast: boolean;
    isStreaming: boolean;
    debug: boolean;
  }) => {
    const showIsStreaming = isLast && isStreaming;
    return (
      <div className="max-w-xl w-full">
        <div className="row">
          <div className="w-8 shrink-0">
            <div className="size-6 relative">
              {message.role === 'assistant' ? (
                <LogoSquare className="size-full rounded-full" />
              ) : (
                <div className="size-full bg-black text-white rounded-full center-center">
                  <UserIcon className="size-4" />
                </div>
              )}

              <div
                className={cn(
                  'absolute inset-0 bg-background rounded-full center-center opacity-0',
                  showIsStreaming && 'opacity-100',
                )}
              >
                <Loader2Icon className="size-4 animate-spin text-foreground" />
              </div>
            </div>
          </div>
          <div className="col gap-4 flex-1">
            {message.parts.map((p, index) => {
              const key = index.toString() + p.type;
              const isToolInvocation = p.type === 'tool-invocation';

              if (p.type === 'step-start') {
                return null;
              }

              if (!isToolInvocation && p.type !== 'text') {
                return <Debug enabled={debug} json={p} />;
              }

              if (p.type === 'text') {
                return (
                  <div className="prose dark:prose-invert prose-sm" key={key}>
                    <Markdown>{p.text}</Markdown>
                  </div>
                );
              }

              if (isToolInvocation && p.toolInvocation.state === 'result') {
                const { result } = p.toolInvocation;

                if (result.type === 'report') {
                  const report = zChartInputAI.safeParse(result.report);
                  if (report.success) {
                    return (
                      <Fragment key={key}>
                        <Debug json={result} enabled={debug} />
                        <ChatReport report={report.data} lazy={!isLast} />
                      </Fragment>
                    );
                  }
                }

                return (
                  <Debug
                    key={key}
                    json={p.toolInvocation.result}
                    enabled={debug}
                  />
                );
              }

              return null;
            })}
            {showIsStreaming && (
              <div className="w-full col gap-2">
                <Skeleton className="w-3/5 h-4" />
                <Skeleton className="w-4/5 h-4" />
                <Skeleton className="w-2/5 h-4" />
              </div>
            )}
          </div>
        </div>
        {!isLast && (
          <div className="w-full shrink-0 pl-8 mt-4">
            <div className="h-px bg-border" />
          </div>
        )}
      </div>
    );
  },
);

function Debug({ enabled, json }: { enabled?: boolean; json?: any }) {
  if (!enabled) {
    return null;
  }

  return (
    <Accordion type="single" collapsible>
      <Card>
        <AccordionItem value={'json'}>
          <AccordionTrigger className="text-left p-4 py-2 w-full font-medium font-mono row items-center">
            <span className="flex-1">Show JSON result</span>
          </AccordionTrigger>
          <AccordionContent className="p-2">
            <Syntax
              wrapLines
              language="json"
              code={JSON.stringify(json, null, 2)}
            />
          </AccordionContent>
        </AccordionItem>
      </Card>
    </Accordion>
  );
}
