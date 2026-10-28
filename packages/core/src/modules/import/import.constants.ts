import { z } from 'zod';
import { MS_PER_DAY } from '../../shared/time.constants';

export type ImportProviderId = 'umami' | 'mixpanel' | 'amplitude';
export type ImportProviderType = 'file' | 'api';

export interface ImportProviderMeta {
  id: ImportProviderId;
  name: string;
  description: string;
  logo: string;
  backgroundColor: string;
  types: ImportProviderType[];
}

export const IMPORT_PROVIDERS: ImportProviderMeta[] = [
  {
    id: 'umami',
    name: 'Umami',
    description: 'Import your analytics data from Umami',
    logo: 'https://cdn.brandfetch.io/id_3VEohOm/w/180/h/180/theme/dark/logo.png?c=1dxbfHSJFAPEGdCLU4o5B',
    backgroundColor: '#fff',
    types: ['file'],
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    description: 'Import your analytics data from Mixpanel API',
    logo: 'https://cdn.brandfetch.io/idr_rhI2FS/theme/dark/idMJ8uODLv.svg?c=1dxbfHSJFAPEGdCLU4o5B',
    backgroundColor: '#fff',
    types: ['api'],
  },
  {
    id: 'amplitude',
    name: 'Amplitude',
    description: 'Import your analytics data from the Amplitude Export API',
    logo: 'https://cdn.brandfetch.io/idnYrZGER0/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B',
    backgroundColor: '#fff',
    types: ['api'],
  },
];

const zProjectMapper = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

/**
 * `z.string().url()` alone accepts `file:`, `gopher:` and friends. Restricting
 * the scheme here gives the user an immediate form error instead of a job that
 * fails later. It is NOT the SSRF control - the value is stored and fetched
 * afterwards, so the destination is re-validated at fetch time by
 * `safeFetchStream`.
 */
export const zHttpUrl = z
  .string()
  .url()
  .refine(
    (value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Only http and https URLs are allowed' }
  );

const createFileImportConfig = <T extends string>(provider: T) =>
  z.object({
    provider: z.literal(provider),
    type: z.literal('file'),
    fileUrl: zHttpUrl,
  });

// Import configs
export const zUmamiImportConfig = createFileImportConfig('umami').extend({
  projectMapper: z.array(zProjectMapper),
});

export type IUmamiImportConfig = z.infer<typeof zUmamiImportConfig>;

export const zPlausibleImportConfig = createFileImportConfig('plausible');
export type IPlausibleImportConfig = z.infer<typeof zPlausibleImportConfig>;

/** Twenty years of daily export chunks; a wider range is a typo, not a history. */
export const MAX_IMPORT_RANGE_DAYS = 20 * 366;

/** Days covered by a `YYYY-MM-DD` range, inclusive; `NaN` when either end is not a date. */
export function getImportRangeDays(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY + 1;
}

const isImportRangeSupported = ({ from, to }: { from: string; to: string }) => {
  const days = getImportRangeDays(from, to);
  return days >= 1 && days <= MAX_IMPORT_RANGE_DAYS;
};

const IMPORT_RANGE_ISSUE = {
  path: ['to'],
  message: `The end date must be on or after the start date and at most ${MAX_IMPORT_RANGE_DAYS} days later`,
};

export const zAmplitudeDataResidency = z.enum(['us', 'eu']);
export type IAmplitudeDataResidency = z.infer<typeof zAmplitudeDataResidency>;

export const zAmplitudeImportConfig = z
  .object({
    provider: z.literal('amplitude'),
    type: z.literal('api'),
    apiKey: z.string().min(1),
    secretKey: z.string().min(1),
    from: z.iso.date(),
    to: z.iso.date(),
    mapScreenViewProperty: z.string().optional(),
    dataResidency: zAmplitudeDataResidency.optional(),
  })
  .refine(isImportRangeSupported, IMPORT_RANGE_ISSUE);
export type IAmplitudeImportConfig = z.infer<typeof zAmplitudeImportConfig>;

export const zMixpanelDataResidency = z.enum(['us', 'eu', 'in']);
export type IMixpanelDataResidency = z.infer<typeof zMixpanelDataResidency>;

export const zMixpanelImportConfig = z
  .object({
    provider: z.literal('mixpanel'),
    type: z.literal('api'),
    serviceAccount: z.string().min(1),
    serviceSecret: z.string().min(1),
    projectId: z.string().min(1),
    from: z.iso.date(),
    to: z.iso.date(),
    mapScreenViewProperty: z.string().optional(),
    dataResidency: zMixpanelDataResidency.optional(),
  })
  .refine(isImportRangeSupported, IMPORT_RANGE_ISSUE);
export type IMixpanelImportConfig = z.infer<typeof zMixpanelImportConfig>;

export type IImportConfig =
  | IUmamiImportConfig
  | IPlausibleImportConfig
  | IMixpanelImportConfig
  | IAmplitudeImportConfig;

export const zCreateImport = z
  .object({
    projectId: z.string().min(1),
    provider: z.enum(['umami', 'plausible', 'mixpanel', 'amplitude']),
    config: z.union([
      zUmamiImportConfig,
      zPlausibleImportConfig,
      zMixpanelImportConfig,
      zAmplitudeImportConfig,
    ]),
  })
  // The service only ever reads `config.provider`, so a mismatched top-level
  // `provider` was accepted and then silently ignored.
  .refine((input) => input.provider === input.config.provider, {
    path: ['provider'],
    message: 'provider must match config.provider',
  });

export type ICreateImport = z.infer<typeof zCreateImport>;
