import { CopyIcon } from 'lucide-react';
import { Label } from '../ui/label';
import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';

type Props = {
  label: React.ReactNode;
  value: string;
  className?: string;
};

const CopyInput = ({ label, value, className }: Props) => {
  return (
    <button
      className={cn('w-full min-w-0 text-left', className)}
      onClick={() => clipboard(value)}
      type="button"
    >
      {!!label && <Label>{label}</Label>}
      <div className="flex items-center justify-between gap-2 rounded bg-muted p-2 px-3 font-mono">
        <span className="min-w-0 flex-1 truncate">{value}</span>
        <CopyIcon className="shrink-0" size={16} />
      </div>
    </button>
  );
};

export default CopyInput;
