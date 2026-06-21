import { clipboard } from '@/utils/clipboard';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Tooltiper } from './ui/tooltip';

type Props = {
  children: React.ReactNode;
  className?: string;
  value: string;
};

const ClickToCopy = ({ children, value }: Props) => {
  const { t } = useTranslation();

  return (
    <Tooltiper
      content={t('ui.click_to_copy')}
      asChild
      className="cursor-pointer"
      onClick={() => {
        clipboard(value);
        toast(t('ui.copied_to_clipboard'));
      }}
    >
      {children}
    </Tooltiper>
  );
};

export default ClickToCopy;
