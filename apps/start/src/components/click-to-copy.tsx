import { clipboard } from '@/utils/clipboard';
import { toast } from 'sonner';

import { Tooltiper } from './ui/tooltip';

type Props = {
  children: React.ReactNode;
  className?: string;
  value: string;
};

const ClickToCopy = ({ children, value }: Props) => {
  return (
    <Tooltiper
      content="Click to copy"
      asChild
      className="cursor-pointer"
      onClick={() => {
        clipboard(value);
        toast('Copied to clipboard');
      }}
    >
      {children}
    </Tooltiper>
  );
};

export default ClickToCopy;
