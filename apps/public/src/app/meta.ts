import type { Metadata } from 'next';

const title = 'An open-source alternative to Mixpanel | Openpanel.dev';
const description =
  'Unlock actionable insights effortlessly with Insightful, the open-source analytics library that combines the power of Mixpanel with the simplicity of Plausible. Enjoy a unified overview, predictable pricing, and a vibrant community. Join us in democratizing analytics today!';

export const defaultMeta: Metadata = {
  title,
  description,
  openGraph: {
    title,
    url: 'https://openpanel.dev',
    type: 'website',
    images: [
      {
        url: 'https://openpanel.dev/ogimage.png',
        width: 2011,
        height: 1339,
        alt: title,
      },
    ],
  },
};
