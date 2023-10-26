import { api, handleError } from "@/utils/api";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { ButtonContainer } from "@/components/ButtonContainer";
import { popModal } from ".";
import { toast } from "@/components/ui/use-toast";
import { InputWithLabel } from "@/components/forms/InputWithLabel";
import { useRefetchActive } from "@/hooks/useRefetchActive";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Copy } from "lucide-react";
import { clipboard } from "@/utils/clipboard";
import dynamic from "next/dynamic";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";

const Syntax = dynamic(import('@/components/Syntax'))

const validator = z.object({
  name: z.string().min(1, "Required"),
  projectId: z.string().min(1, "Required"),
});

type IForm = z.infer<typeof validator>;

export default function CreateProject() {
  const params = useOrganizationParams()
  const refetch = useRefetchActive();
  const query = api.project.list.useQuery({
    organizationSlug: params.organization,
  });
  const mutation = api.client.create.useMutation({
    onError: handleError,
    onSuccess() {
      toast({
        title: "Success",
        description: "Client created!",
      });
      refetch();
    },
  });
  const { register, handleSubmit, formState, control } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: "",
      projectId: "",
    },
  });

  if (mutation.isSuccess && mutation.data) {
    const { clientId, clientSecret } = mutation.data;
    return (
      <ModalContent>
        <ModalHeader title="Client created 🚀" />
        <p>
          Your client has been created! You will only see the client secret once
          so keep it safe 🫣
        </p>

        <button className="mt-4 text-left" onClick={() => clipboard(clientId)}>
          <Label>Client ID</Label>
          <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
            {clientId}
            <Copy size={16} />
          </div>
        </button>
        <button
          className="mt-4 text-left"
          onClick={() => clipboard(clientSecret)}
        >
          <Label>Client Secret</Label>
          <div className="flex items-center justify-between rounded bg-gray-100 p-2 px-3">
            {clientSecret}
            <Copy size={16} />
          </div>
        </button>
        <div className="mt-4">
          <Label>Code snippet</Label>
          <div className="overflow-x-auto [&_pre]:!rounded [&_pre]:!bg-gray-100 [&_pre]:text-sm">
            <Syntax
              code={`const mixan = new Mixan({
  clientId: "${clientId}",
  clientSecret: "${clientSecret}",
})`}
            />
          </div>
        </div>

        <ButtonContainer>
          <div />
          <Button onClick={() => popModal()}>Done</Button>
        </ButtonContainer>
      </ModalContent>
    );
  }

  return (
    <ModalContent>
      <ModalHeader title="Create client" />
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate({
            ...values,
            organizationSlug: params.organization,
          });
        })}
      >
        <InputWithLabel
          label="Name"
          placeholder="Name"
          {...register("name")}
          className="mb-4"
        />
        <Controller
          control={control}
          name="projectId"
          render={({ field }) => {
            return (
              <div>
                <Label className="mb-2 block">Project</Label>
                <Combobox
                  {...field}
                  onChange={(value) => {
                    console.log("wtf?", value);

                    field.onChange(value);
                  }}
                  items={
                    query.data?.map((item) => ({
                      value: item.id,
                      label: item.name,
                    })) ?? []
                  }
                  placeholder="Select a project"
                />
              </div>
            );
          }}
        />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isDirty}>
            Create
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
