import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';

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
      <p className="-mt-2 text-lg leading-normal">{text}</p>
      <ButtonContainer>
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
      </ButtonContainer>
    </ModalContent>
  );
}
