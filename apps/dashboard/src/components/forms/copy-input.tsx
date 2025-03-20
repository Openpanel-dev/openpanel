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
      className={cn('w-full text-left', className)}
      onClick={() => clipboard(value)}
    >
      {!!label && <Label>{label}</Label>}
      <div className="font-mono flex items-center justify-between rounded border-input bg-card p-2 px-3 ">
        {value}
        <CopyIcon size={16} />
      </div>
    </button>
  );
};

export default CopyInput;
