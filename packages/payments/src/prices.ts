export type { ProductPrice } from '@polar-sh/sdk/models/components/productprice.js';

function formatEventsCount(events: number) {
  return new Intl.NumberFormat('en-gb', {
    notation: 'compact',
  }).format(events);
}

export type IPrice = {
  price: number;
  events: number;
  discount?: {
    code: string;
    amount: number;
    id: string;
  };
  popular?: boolean;
};

export const PRICING: IPrice[] = [
  { price: 2.5, events: 5_000 },
  { price: 5, events: 10_000 },
  { price: 20, events: 100_000 },
  { price: 30, events: 250_000, popular: true },
  { price: 50, events: 500_000 },
  {
    price: 90,
    events: 1_000_000,
    discount: {
      code: '1MIL',
      amount: 0.3,
      id: '5113de97-76aa-4b16-a2ec-fb94edc47371',
    },
  },
  { price: 180, events: 2_500_000 },
  { price: 250, events: 5_000_000 },
  { price: 350, events: 10_000_000 },
  { price: 530, events: 20_000_000 },
  { price: 680, events: 30_000_000 },
  { price: 800, events: 40_000_000 },
  { price: 900, events: 50_000_000 },
];

export const FREE_PRODUCT_IDS = [
  'a18b4bee-d3db-4404-be6f-fba2f042d9ed', // Prod
  '036efa2a-b3b4-4c75-b24a-9cac6bb8893b', // Sandbox
];

export function getRecommendedPlan<T>(
  monthlyEvents: number | undefined | null,
  cb: (
    options: {
      formattedEvents: string;
      formattedPrice: string;
    } & IPrice,
  ) => T,
): T | undefined {
  if (!monthlyEvents) {
    return undefined;
  }
  const price = PRICING.find((price) => price.events >= monthlyEvents);
  if (!price) {
    return undefined;
  }
  return cb({
    ...price,
    formattedEvents: formatEventsCount(price.events),
    formattedPrice: Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price.price),
  });
}
