import { cn } from '@/utils/cn';
import type { useChat } from '@ai-sdk/react';
import { useLocalStorage } from 'usehooks-ts';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';

type Props = Pick<
  ReturnType<typeof useChat>,
  'handleSubmit' | 'handleInputChange' | 'input' | 'append'
> & {
  projectId: string;
  isLimited: boolean;
};

export function ChatForm({
  handleSubmit: handleSubmitProp,
  input,
  handleInputChange,
  append,
  projectId,
  isLimited,
}: Props) {
  const [quickActions, setQuickActions] = useLocalStorage<string[]>(
    `chat-quick-actions:${projectId}`,
    [],
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    handleSubmitProp(e);
    setQuickActions([input, ...quickActions].slice(0, 5));
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-def-100 to-def-100/50 backdrop-blur-sm z-20">
      <ScrollArea orientation="horizontal">
        <div className="row gap-2 px-4">
          {quickActions.map((q) => (
            <Button
              disabled={isLimited}
              key={q}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                append({
                  role: 'user',
                  content: q,
                });
              }}
            >
              {q}
            </Button>
          ))}
        </div>
      </ScrollArea>
      <form onSubmit={handleSubmit} className="p-4 pt-2">
        <input
          disabled={isLimited}
          className={cn(
            'w-full h-12 px-4 outline-none border border-border text-foreground rounded-md font-mono placeholder:text-foreground/50 bg-background/50',
            isLimited && 'opacity-50 cursor-not-allowed',
          )}
          value={input}
          placeholder="Ask me anything..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
