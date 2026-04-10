import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';
import { CopyIcon } from 'lucide-react';

import { Label } from '../ui/label';

type Props = {
  label: React.ReactNode;
  value: string;
  className?: string;
};

const CopyInput = ({ label, value, className }: Props) => {
  return (
    <button
      type="button"
      className={cn('w-full min-w-0 text-left', className)}
      onClick={() => clipboard(value)}
    >
      {!!label && <Label>{label}</Label>}
      <div className="font-mono flex items-center justify-between gap-2 rounded bg-muted p-2 px-3">
        <span className="min-w-0 flex-1 truncate">{value}</span>
        <CopyIcon size={16} className="shrink-0" />
      </div>
    </button>
  );
};

export default CopyInput;
