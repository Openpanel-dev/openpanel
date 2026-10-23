import { Spinner } from '@/components/ui/spinner';

const FullPageLoadingState = ({ title = 'Loading…' }: { title?: string }) => {
  return (
    <div
      aria-busy
      className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-3 p-8 text-center lg:min-h-dvh"
    >
      <Spinner size="md" />
      <p className="text-muted-foreground text-sm">{title}</p>
    </div>
  );
};

export default FullPageLoadingState;
