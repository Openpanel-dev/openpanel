import type { Metadata } from 'next';

const title = 'Openpanel.dev | A Open-Source Analytics Library';
const description =
  'Unlock actionable insights effortlessly with Insightful, the open-source analytics library that combines the power of Mixpanel with the simplicity of Plausible. Enjoy a unified overview, predictable pricing, and a vibrant community. Join us in democratizing analytics today!';

export const defaultMeta: Metadata = {
  title,
  description,
  openGraph: {
    title,
    images: [
      {
        url: 'https://openpanel.dev/ogimage.png',
        width: 1200,
        height: 630,
        alt: 'Openpanel.dev | A Open-Source Analytics Library',
      },
    ],
  },
};
