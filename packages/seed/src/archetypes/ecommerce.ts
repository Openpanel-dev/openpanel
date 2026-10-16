// Acme Shop: mostly anonymous shoppers; an account (identify) is created at
// the first purchase for a share of them. Funnel: product_viewed →
// add_to_cart → checkout_started → shipping_info_added → payment_info_added
// → purchase. Cohort-worthy: has purchased, has an account, used a coupon,
// wishlisted.

import { newPerson } from '../data/people';
import { REFERRERS } from '../data/referrers';
import type { Visitor } from '../model';
import type { Rng } from '../rng';
import type { Archetype, Journey } from './archetype';

const CATEGORIES = [
  'sneakers',
  'boots',
  'sandals',
  'running',
  'kids',
  'accessories',
] as const;
const BRANDS = ['Acme', 'Northwind', 'Vela', 'Kestrel', 'Orbit'] as const;
const SIZES = [
  '36',
  '37',
  '38',
  '39',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
] as const;
const COLORS = ['black', 'white', 'navy', 'sand', 'olive', 'red'] as const;
const PAYMENTS = [
  'card',
  'paypal',
  'klarna',
  'apple_pay',
  'google_pay',
] as const;
const SHIPPING = ['standard', 'express', 'pickup'] as const;
const COUPONS = ['WELCOME10', 'SUMMER20', 'FREESHIP', 'VIP15'] as const;
const LOYALTY_TIERS = ['bronze', 'silver', 'gold'] as const;
/** Ten of each category, so `product_viewed.sku` has real cardinality. */
const PRODUCTS_PER_CATEGORY = 10;

interface Product {
  sku: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  brand: (typeof BRANDS)[number];
  price: number;
}

function catalogue(): Product[] {
  const products: Product[] = [];
  for (const [categoryIndex, category] of CATEGORIES.entries()) {
    for (let n = 1; n <= PRODUCTS_PER_CATEGORY; n++) {
      products.push({
        sku: `${category.slice(0, 3).toUpperCase()}-${String(n).padStart(3, '0')}`,
        name: `${category[0]?.toUpperCase()}${category.slice(1)} ${n}`,
        category,
        brand: BRANDS[(categoryIndex + n) % BRANDS.length] ?? 'Acme',
        price: 39 + ((categoryIndex * 37 + n * 23) % 180),
      });
    }
  }
  return products;
}

const PRODUCTS = catalogue();

const ACCOUNT_SHARE = 0.4;
const BOUNCE_CHANCE = 0.38;
const SEARCH_CHANCE = 0.2;
const FILTER_CHANCE = 0.25;
const WISHLIST_CHANCE = 0.06;
const ADD_TO_CART_CHANCE = 0.22;
const REMOVE_FROM_CART_CHANCE = 0.15;
const CHECKOUT_CHANCE = 0.45;
const SHIPPING_CHANCE = 0.85;
const PAYMENT_CHANCE = 0.8;
const PURCHASE_CHANCE = 0.85;
const COUPON_CHANCE = 0.2;
const REVIEW_CHANCE = 0.08;
const SHIPPING_PRICE = 9;

interface ShopState {
  cart?: Product[];
  purchases?: number;
  couponUsed?: boolean;
  wishlisted?: boolean;
}

function stateOf(visitor: Visitor): ShopState {
  return visitor.state as ShopState;
}

function viewProduct(rng: Rng, journey: Journey, product: Product): void {
  journey.view(
    `/product/${product.sku.toLowerCase()}`,
    `${product.name} — Acme Shop`,
    { sku: product.sku, category: product.category }
  );
  journey.event('product_viewed', {
    sku: product.sku,
    name: product.name,
    category: product.category,
    brand: product.brand,
    price: product.price,
    in_stock: rng.chance(0.92),
    rating: rng.int(3, 5),
  });
  if (rng.chance(0.3)) {
    journey.event('product_image_zoomed', { sku: product.sku });
  }
}

function cartValue(cart: readonly Product[]): number {
  let total = 0;
  for (const product of cart) {
    total += product.price;
  }
  return total;
}

function checkout(
  rng: Rng,
  journey: Journey,
  visitor: Visitor,
  state: ShopState,
  cart: Product[]
): void {
  journey.view('/checkout', 'Checkout');
  const value = cartValue(cart);
  journey.event('checkout_started', {
    items: cart.length,
    value,
    currency: 'USD',
  });
  if (!rng.chance(SHIPPING_CHANCE)) {
    return;
  }
  const shipping = rng.one(SHIPPING);
  journey.event('shipping_info_added', {
    method: shipping,
    country: visitor.geo.country,
  });
  if (!rng.chance(PAYMENT_CHANCE)) {
    return;
  }
  const payment = rng.one(PAYMENTS);
  journey.event('payment_info_added', { method: payment });
  let coupon: string | null = null;
  if (rng.chance(COUPON_CHANCE)) {
    coupon = rng.one(COUPONS);
    journey.event('coupon_applied', {
      code: coupon,
      discount_percent: coupon === 'FREESHIP' ? 0 : Number(coupon.slice(-2)),
    });
    state.couponUsed = true;
  }
  if (!rng.chance(PURCHASE_CHANCE)) {
    return;
  }
  // The first order creates the account for those who make one.
  if (visitor.person && !visitor.identified) {
    journey.identify(visitor.person);
    journey.event('account_created', {
      method: rng.one(['email', 'google', 'apple']),
      at: 'checkout',
    });
  }
  const orderId = `ord_${rng.hex(8)}`;
  const total =
    value +
    (shipping === 'pickup' || coupon === 'FREESHIP' ? 0 : SHIPPING_PRICE);
  journey.view(`/order/${orderId}`, 'Thank you');
  journey.event('purchase', {
    order_id: orderId,
    items: cart.length,
    value: total,
    currency: 'USD',
    payment,
    shipping,
    coupon,
    first_purchase: (state.purchases ?? 0) === 0,
    categories: [...new Set(cart.map((product) => product.category))].join(','),
  });
  journey.revenue(total, { order_id: orderId, currency: 'USD' });
  state.purchases = (state.purchases ?? 0) + 1;
  state.cart = [];
  if (rng.chance(REVIEW_CHANCE)) {
    const reviewed = rng.one(cart);
    journey.event('review_submitted', {
      sku: reviewed.sku,
      rating: rng.int(2, 5),
    });
  }
}

export const ecommerceArchetype: Archetype = {
  id: 'ecommerce',
  projectName: 'Acme Shop',
  origin: 'https://shop.acme.test',
  domain: 'https://shop.acme.test',
  types: ['website'],
  sdk: { name: 'web', version: '1.0.5' },
  shape: {
    hourly: [
      1.5, 0.8, 0.5, 0.3, 0.3, 0.4, 0.8, 1.5, 2.5, 3.5, 4, 4.5, 4.5, 4, 4, 4,
      4.5, 5, 5.5, 6.5, 7, 6, 4.5, 3,
    ],
    dayOfWeek: [1.15, 0.9, 0.9, 0.95, 1.0, 1.1, 1.25],
    trendPerWeek: 0.01,
    spikeChance: 0.05,
    dipChance: 0.02,
    spikeRange: [2, 4],
    dipRange: [0.4, 0.7],
  },
  trafficShare: 0.25,
  returningShare: 0.4,
  retention: { sameDay: 0.18, day1: 0.2, day7: 0.1, day30: 0.06 },
  stickiness(visitor) {
    const state = stateOf(visitor);
    let value = 1;
    if ((state.purchases ?? 0) > 0) {
      value += 1.5;
    }
    if (visitor.identified) {
      value += 1;
    }
    if (state.wishlisted) {
      value += 0.5;
    }
    return value;
  },
  mobileShare: 0.65,
  deviceClass: 'web',
  referrers: [
    { weight: 30, value: null },
    { weight: 28, value: REFERRERS.google },
    { weight: 12, value: REFERRERS.instagram },
    { weight: 10, value: REFERRERS.facebook },
    { weight: 5, value: REFERRERS.youTube },
    { weight: 4, value: REFERRERS.bing },
    { weight: 3, value: REFERRERS.reddit },
    { weight: 3, value: REFERRERS.gmail },
    { weight: 2, value: REFERRERS.twitter },
  ],
  campaignChance: 0.3,
  dwellMedianSeconds: 20,
  utcOffsetHours: 0,
  newPerson(rng) {
    if (!rng.chance(ACCOUNT_SHARE)) {
      return null;
    }
    const person = newPerson(rng, { business: false });
    person.properties = {
      loyalty_tier: rng.one(LOYALTY_TIERS),
      newsletter: String(rng.chance(0.5)),
    };
    return person;
  },
  identity:
    'Anonymous shoppers; an account is created at the first purchase for ~40% of buyers, who are identified from then on.',
  conversions: ['purchase', 'account_created'],
  funnels: [
    {
      name: 'Checkout',
      steps: [
        'product_viewed',
        'add_to_cart',
        'checkout_started',
        'shipping_info_added',
        'payment_info_added',
        'purchase',
      ],
      breakdowns: [
        'category',
        'brand',
        'payment',
        'shipping',
        'device',
        'country',
        'coupon',
      ],
    },
    {
      name: 'Search to cart',
      steps: ['search', 'product_viewed', 'add_to_cart'],
      breakdowns: ['query', 'category'],
    },
  ],
  journey(rng, journey, visitor) {
    const state = stateOf(visitor);
    state.cart ??= [];

    const entry = rng.pick([
      { weight: 45, value: 'home' },
      { weight: 30, value: 'product' },
      { weight: 25, value: 'category' },
    ] as const);
    if (entry === 'home') {
      journey.view('/', 'Acme Shop');
    } else if (entry === 'category') {
      const category = rng.one(CATEGORIES);
      journey.view(`/category/${category}`, `${category} — Acme Shop`, {
        category,
      });
    } else {
      viewProduct(rng, journey, rng.one(PRODUCTS));
    }
    if (rng.chance(BOUNCE_CHANCE)) {
      return;
    }

    if (rng.chance(SEARCH_CHANCE)) {
      const query = rng.one([
        'white sneakers',
        'boots',
        'running shoes',
        'sale',
        'kids',
        'sandals',
      ]);
      journey.event('search', { query, results: rng.int(0, 40) });
    }
    if (rng.chance(FILTER_CHANCE)) {
      journey.event('filter_applied', {
        facet: rng.one(['size', 'color', 'brand', 'price']),
        value: rng.one([...SIZES, ...COLORS, ...BRANDS]),
      });
    }

    const browses = rng.int(1, 4);
    for (let i = 0; i < browses; i++) {
      const product = rng.one(PRODUCTS);
      if (rng.chance(0.4)) {
        journey.view(
          `/category/${product.category}`,
          `${product.category} — Acme Shop`,
          { category: product.category }
        );
      }
      viewProduct(rng, journey, product);
      if (rng.chance(WISHLIST_CHANCE)) {
        journey.event('wishlist_added', {
          sku: product.sku,
          category: product.category,
        });
        state.wishlisted = true;
      }
      if (rng.chance(ADD_TO_CART_CHANCE)) {
        journey.event('add_to_cart', {
          sku: product.sku,
          name: product.name,
          category: product.category,
          brand: product.brand,
          price: product.price,
          quantity: 1,
          size: rng.one(SIZES),
          color: rng.one(COLORS),
        });
        state.cart.push(product);
      }
    }
    if (state.cart.length === 0) {
      return;
    }

    journey.view('/cart', 'Your cart', {
      items: state.cart.length,
      value: cartValue(state.cart),
    });
    if (rng.chance(REMOVE_FROM_CART_CHANCE)) {
      const removed = state.cart.pop();
      if (removed) {
        journey.event('remove_from_cart', {
          sku: removed.sku,
          category: removed.category,
        });
      }
    }
    if (state.cart.length > 0 && rng.chance(CHECKOUT_CHANCE)) {
      checkout(rng, journey, visitor, state, state.cart);
    }
  },
};
