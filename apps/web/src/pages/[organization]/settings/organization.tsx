import { api, handleError } from "@/utils/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ContentHeader, ContentSection } from "@/components/Content";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { SettingsLayout } from "@/components/layouts/SettingsLayout";
import { toast } from "@/components/ui/use-toast";
import { createServerSideProps } from "@/server/getServerSideProps";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { z } from "zod";
import { InputError } from "@/components/forms/InputError";
import { useRouter } from "next/router";

export const getServerSideProps = createServerSideProps();

const validator = z.object({
  id: z.string().min(2),
  name: z.string().min(2),
});

type IForm = z.infer<typeof validator>;

export default function Organization() {
  const router = useRouter()
  const params = useOrganizationParams();
  const query = api.organization.get.useQuery({
    slug: params.organization,
  });
  const mutation = api.organization.update.useMutation({
    onSuccess(res) {
      toast({
        title: "Organization updated",
        description: "Your organization has been updated.",
      });
      query.refetch();
      router.replace(`/${res.slug}/settings/organization`)
    },
    onError: handleError,
  });
  const data = query.data;

  const { register, handleSubmit, reset, formState } = useForm<IForm>({
    defaultValues: {
      id: "",
      name: "",
    },
  });

  useEffect(() => {
    if (data) {
      reset(data);
    }
  }, [data, reset]);


  return (
    <SettingsLayout>
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values)
        })}
        className="flex flex-col divide-y divide-border"
      >
        <ContentHeader
          title="Organization"
          text="View and update your organization"
        >
          <Button type="submit" disabled={!formState.isDirty}>Save</Button>
        </ContentHeader>
        <ContentSection title="Name" text={["Notice. Changing name will result in a url change as well.", <InputError key="error" {...formState.errors.name} />]}>
          <Input {...register("name")} />
        </ContentSection>
        <ContentSection
          title="Invite user"
          text="Invite users to this organization. You can invite several users with (,)"
        >
          <Input disabled />
        </ContentSection>
      </form>
    </SettingsLayout>
  );
}
