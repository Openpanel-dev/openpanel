import { z } from "zod";
import { useQueryParams } from "./useQueryParams";

export function useOrganizationParams() {
  return useQueryParams(
    z.object({
      organization: z.string(),
      project: z.string(),
      dashboard: z.string(),
      profileId: z.string().optional(),
    }),
  );
}