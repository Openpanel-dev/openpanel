import { zodResolver } from '@hookform/resolvers/zod';
import type { SubmitHandler } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';

const validator = z.object({
  name: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

type EditReportProps = {
  form: IForm;
  onSubmit: SubmitHandler<IForm>;
};

export default function EditReport({ form, onSubmit }: EditReportProps) {
  const { t: translateUi } = useDashboardTranslation();

  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: form,
  });

  return (
    <ModalContent>
      <ModalHeader title={translateUi('Edit report')} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <InputWithLabel
          label={translateUi('Name')}
          placeholder={translateUi('Name')}
          {...register('name')}
        />
        <DialogFooter>
          <Button onClick={() => popModal()} type="button" variant="outline">
            <DashboardText i18nKey={'Cancel'} />{' '}
          </Button>
          <Button disabled={!formState.isDirty} type="submit">
            <DashboardText i18nKey={'Update'} />{' '}
          </Button>
        </DialogFooter>
      </form>
    </ModalContent>
  );
}
