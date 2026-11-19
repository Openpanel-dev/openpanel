import { ShieldCheckIcon } from 'lucide-react';
import { approvalPrompt } from '../tool-labels';
import { Button } from '@/components/ui/button';

export function ApprovalCard({
  toolName,
  input,
  onRespond,
}: {
  toolName: string;
  input: unknown;
  onRespond: (approved: boolean) => void;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-start gap-2">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">
            {approvalPrompt(toolName, input)}
          </div>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={() => onRespond(false)} size="sm" variant="ghost">
          Cancel
        </Button>
        <Button onClick={() => onRespond(true)} size="sm">
          Confirm
        </Button>
      </div>
    </div>
  );
}

export function ApprovalDecided({
  toolName,
  input,
  approved,
}: {
  toolName: string;
  input: unknown;
  approved: boolean;
}) {
  return (
    <div className="text-muted-foreground text-sm">
      {approvalPrompt(toolName, input)}{' '}
      <span className="font-medium">
        {approved ? 'Confirmed.' : 'Cancelled.'}
      </span>
    </div>
  );
}
