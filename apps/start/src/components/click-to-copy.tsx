import { toast } from 'sonner';
import { Tooltiper } from './ui/tooltip';
import { clipboard } from '@/utils/clipboard';

type Props = {
  children: React.ReactNode;
  className?: string;
  value: string;
};

const ClickToCopy = ({ children, value }: Props) => {
  return (
    <Tooltiper
      asChild
      className="cursor-pointer"
      content="Click to copy"
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
