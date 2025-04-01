export type IPrice = {
  price: number;
  events: number;
};

export const PRICING: IPrice[] = [
  { price: 2.5, events: 5_000 },
  { price: 5, events: 10_000 },
  { price: 20, events: 100_000 },
  { price: 30, events: 250_000 },
  { price: 50, events: 500_000 },
  { price: 90, events: 1_000_000 },
  { price: 180, events: 2_500_000 },
  { price: 250, events: 5_000_000 },
  { price: 400, events: 10_000_000 },
  // { price: 650, events: 20_000_000 },
  // { price: 900, events: 30_000_000 },
];

export const FREE_PRODUCT_IDS = [
  'a18b4bee-d3db-4404-be6f-fba2f042d9ed', // Prod
  '036efa2a-b3b4-4c75-b24a-9cac6bb8893b', // Sandbox
];
