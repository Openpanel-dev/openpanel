import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

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
          Cancel
        </Button>
        <Button
          onClick={() => {
            popModal('Confirm');
            onConfirm();
          }}
        >
          Yes
        </Button>
      </DialogFooter>
    </ModalContent>
  );
}
