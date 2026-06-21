import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CopyIcon, MoreHorizontal, TrashIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

export interface ReportEventMoreProps {
  onClick: (action: 'remove' | 'duplicate') => void;
}

export function ReportEventMore({ onClick }: ReportEventMoreProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onClick('duplicate')}>
            <CopyIcon className="mr-2 h-4 w-4" />
            {t('reports.duplicate')}
            <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600"
            onClick={() => onClick('remove')}
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            {t('reports.delete')}
            <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
