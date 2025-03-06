import { ScanEyeIcon } from 'lucide-react';

import { Button, type ButtonProps } from '../ui/button';

type Props = Omit<ButtonProps, 'children'>;

const OverviewDetailsButton = (props: Props) => {
  return (
    <Button size="icon" variant="ghost" {...props}>
      <ScanEyeIcon size={18} />
    </Button>
  );
};

export default OverviewDetailsButton;
