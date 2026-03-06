export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
};

export type CartItem = Product & { qty: number };

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  groupIds: string[];
};

export type Group = {
  id: string;
  name: string;
  type: string;
  properties: Record<string, string>;
};
