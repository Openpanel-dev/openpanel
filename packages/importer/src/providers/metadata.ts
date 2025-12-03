export type ImportProviderId = 'umami' | 'mixpanel';
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
];
