import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { TranslationText as DashboardText } from '@/i18n/provider';

export type ConfirmProps = {
  title: string;
  text: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

export default function Confirm({
  title,
  text,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <ModalContent>
      <ModalHeader title={title} />
      <p className="-mt-2 text-base">{text}</p>
      <DialogFooter>
        <Button
          onClick={() => {
            popModal('Confirm');
            onCancel?.();
          }}
          variant="outline"
        >
          <DashboardText i18nKey={'Cancel'} />{' '}
        </Button>
        <Button
          onClick={() => {
            popModal('Confirm');
            onConfirm();
          }}
        >
          <DashboardText i18nKey={'Yes'} />{' '}
        </Button>
      </DialogFooter>
    </ModalContent>
  );
}
