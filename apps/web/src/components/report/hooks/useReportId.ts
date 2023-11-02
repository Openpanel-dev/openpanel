import { useQueryParams } from '@/hooks/useQueryParams';
import { z } from 'zod';

export const useReportId = () =>
  useQueryParams(
    z.object({
      reportId: z.string().optional(),
    })
  );
