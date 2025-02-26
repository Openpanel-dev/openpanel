import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

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
      <p className="text-lg -mt-2">{text}</p>
      <ButtonContainer>
        <Button
          variant="outline"
          onClick={() => {
            popModal('Confirm');
            onCancel?.();
          }}
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
