import { api, handleError } from "@/utils/api";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { ButtonContainer } from "@/components/ButtonContainer";
import { popModal } from ".";
import { toast } from "@/components/ui/use-toast";
import { InputWithLabel } from "@/components/forms/InputWithLabel";
import { useRefetchActive } from "@/hooks/useRefetchActive";
import { type IChartInput } from "@/types";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { useRouter } from "next/router";

type SaveReportProps = {
  report: IChartInput;
  reportId?: string;
};

const validator = z.object({
  name: z.string().min(1, "Required"),
  projectId: z.string().min(1, "Required"),
  dashboardId: z.string().min(1, "Required"),
});

type IForm = z.infer<typeof validator>;

export default function SaveReport({ report }: SaveReportProps) {
  const router = useRouter()
  const { organization } = useOrganizationParams();
  const refetch = useRefetchActive();
  const save = api.report.save.useMutation({
    onError: handleError,
    onSuccess(res) {
      toast({
        title: "Success",
        description: "Report saved.",
      });
      popModal();
      refetch();
      router.push(`/${organization}/reports/${res.id}`)
    },
  });

  const { register, handleSubmit, formState, control, setValue } =
    useForm<IForm>({
      resolver: zodResolver(validator),
      defaultValues: {
        name: "",
        projectId: "",
        dashboardId: "",
      },
    });

  const dashboardMutation = api.dashboard.create.useMutation({
    onError: handleError,
    onSuccess(res) {
      setValue("dashboardId", res.id);
      dashboasrdQuery.refetch();
      toast({
        title: "Success",
        description: "Dashboard created.",
      });
    },
  });

  const projectId = useWatch({
    name: "projectId",
    control,
  });

  const projectQuery = api.project.list.useQuery({
    organizationSlug: organization,
  });

  const dashboasrdQuery = api.dashboard.list.useQuery(
    {
      projectId,
    },
    {
      enabled: !!projectId,
    },
  );

  const projects = (projectQuery.data ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));

  const dashboards = (dashboasrdQuery.data ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));

  return (
    <ModalContent>
      <ModalHeader title="Edit client" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(({ name, ...values }) => {
          save.mutate({
            report: {
              ...report,
              name,
            },
            ...values,
          });
        })}
      >
        <InputWithLabel
          label="Report name"
          placeholder="Name"
          {...register("name")}
          defaultValue={report.name}
        />
        <Controller
          control={control}
          name="projectId"
          render={({ field }) => {
            return (
              <div>
                <Label>Project</Label>
                <Combobox
                  {...field}
                  items={projects}
                  placeholder="Select a project"
                />
              </div>
            );
          }}
        />
        <Controller
          control={control}
          name="dashboardId"
          render={({ field }) => {
            return (
              <div>
                <Label>Dashboard</Label>
                <Combobox
                  disabled={!projectId}
                  {...field}
                  items={dashboards}
                  placeholder="Select a dashboard"
                  onCreate={(value) => {
                    dashboardMutation.mutate({
                      projectId,
                      name: value,
                    });
                  }}
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
            Save
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
