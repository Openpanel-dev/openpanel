import { CopyIcon } from 'lucide-react';
import { Label } from '../ui/label';
import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';

interface Props {
  label: React.ReactNode;
  value: string;
  className?: string;
  onCopy?: () => void;
}

const CopyInput = ({ label, value, className, onCopy }: Props) => {
  return (
    <button
      className={cn('w-full min-w-0 text-left', className)}
      onClick={() => {
        clipboard(value);
        onCopy?.();
      }}
      type="button"
    >
      {!!label && <Label>{label}</Label>}
      <div className="flex items-center justify-between gap-2 rounded bg-muted p-2 px-3 tabular-nums">
        <span className="min-w-0 flex-1 truncate">{value}</span>
        <CopyIcon className="shrink-0" size={16} />
      </div>
    </button>
  );
};

export default CopyInput;
