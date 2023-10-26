import { api, handleError } from "@/utils/api";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { ButtonContainer } from "@/components/ButtonContainer";
import { popModal } from ".";
import { toast } from "@/components/ui/use-toast";
import { InputWithLabel } from "@/components/forms/InputWithLabel";
import { useRefetchActive } from "@/hooks/useRefetchActive";

const validator = z.object({
  name: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

export default function AddProject() {
  const refetch = useRefetchActive()
  const mutation = api.project.create.useMutation({
    onError: handleError,
    onSuccess() {
      toast({
        title: 'Success',
        description: 'Project created! Lets create a client for it 🤘',
      })
      refetch()
      popModal()
    }
  });
  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: "",
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Create project" />
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <InputWithLabel label="Name" placeholder="Name" {...register('name')} />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>Cancel</Button>
          <Button type="submit" disabled={!formState.isDirty}>Create</Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
