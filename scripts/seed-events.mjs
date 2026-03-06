#!/usr/bin/env node
/**
 * Seed script for generating realistic analytics events.
 *
 * Usage:
 *   node scripts/seed-events.mjs [--timeline=30] [--sessions=500] [--url=http://localhost:3333]
 *
 * Options:
 *   --timeline=N   Duration in minutes to spread events over (default: 30)
 *   --sessions=N   Number of sessions to generate (default: 500)
 *   --url=URL      API base URL (default: http://localhost:3333)
 *   --clientId=ID  Client ID to use (required or set CLIENT_ID env var)
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const TIMELINE_MINUTES = Number(args.timeline ?? 30);
const SESSION_COUNT = Number(args.sessions ?? 500);
const BASE_URL = args.url ?? 'http://localhost:3333';
const CLIENT_ID = args.clientId ?? process.env.CLIENT_ID ?? '';
const ORIGIN = args.origin ?? process.env.ORIGIN ?? 'https://shop.example.com';
const CONCURRENCY = 20; // max parallel requests

if (!CLIENT_ID) {
  console.error('ERROR: provide --clientId=<id> or set CLIENT_ID env var');
  process.exit(1);
}

const TRACK_URL = `${BASE_URL}/track`;

// ---------------------------------------------------------------------------
// Deterministic seeded random (mulberry32) — keeps identities stable across runs
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Non-deterministic random for events (differs on each run)
const eventRng = Math.random.bind(Math);

function pick(arr, rng = eventRng) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min, max, rng = eventRng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(min, max, rng = eventRng) {
  return rng() * (max - min) + min;
}

// ---------------------------------------------------------------------------
// Fake data pools
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank',
  'Iris', 'Jack', 'Karen', 'Leo', 'Mia', 'Noah', 'Olivia', 'Pete',
  'Quinn', 'Rachel', 'Sam', 'Tina', 'Uma', 'Victor', 'Wendy', 'Xavier',
  'Yara', 'Zoe', 'Aaron', 'Bella', 'Carlos', 'Dani', 'Ethan', 'Fiona',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Wilson', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White',
  'Harris', 'Martin', 'Thompson', 'Moore', 'Young', 'Allen',
];

const EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'proton.me'];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.3; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; Samsung Galaxy S23) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 OPR/107.0.0.0',
];

// Ensure each session has a unique UA by appending a suffix
function makeUniqueUA(base, index) {
  return `${base} Session/${index}`;
}

// Generate a plausible IP address (avoiding private ranges)
function makeIP(index) {
  // Use a spread across several /8 public ranges
  const ranges = [
    [34, 0, 0, 0],
    [52, 0, 0, 0],
    [104, 0, 0, 0],
    [185, 0, 0, 0],
    [213, 0, 0, 0],
  ];
  const base = ranges[index % ranges.length];
  const a = base[0];
  const b = Math.floor(index / 65025) % 256;
  const c = Math.floor(index / 255) % 256;
  const d = index % 255 + 1;
  return `${a}.${b}.${c}.${d}`;
}

// ---------------------------------------------------------------------------
// Products & categories
// ---------------------------------------------------------------------------

const PRODUCTS = [
  { id: 'prod_001', name: 'Wireless Headphones', category: 'Electronics', price: 8999 },
  { id: 'prod_002', name: 'Running Shoes', category: 'Sports', price: 12999 },
  { id: 'prod_003', name: 'Coffee Maker', category: 'Kitchen', price: 5499 },
  { id: 'prod_004', name: 'Yoga Mat', category: 'Sports', price: 2999 },
  { id: 'prod_005', name: 'Smart Watch', category: 'Electronics', price: 29999 },
  { id: 'prod_006', name: 'Blender', category: 'Kitchen', price: 7999 },
  { id: 'prod_007', name: 'Backpack', category: 'Travel', price: 4999 },
  { id: 'prod_008', name: 'Sunglasses', category: 'Accessories', price: 3499 },
  { id: 'prod_009', name: 'Novel: The Last Algorithm', category: 'Books', price: 1499 },
  { id: 'prod_010', name: 'Standing Desk', category: 'Furniture', price: 45999 },
];

const CATEGORIES = ['Electronics', 'Sports', 'Kitchen', 'Travel', 'Accessories', 'Books', 'Furniture'];

// ---------------------------------------------------------------------------
// Groups (3 pre-defined companies)
// ---------------------------------------------------------------------------

const GROUPS = [
  { id: 'org_acme', type: 'company', name: 'Acme Corp', properties: { plan: 'enterprise', industry: 'Technology', employees: 500 } },
  { id: 'org_globex', type: 'company', name: 'Globex Inc', properties: { plan: 'pro', industry: 'Finance', employees: 120 } },
  { id: 'org_initech', type: 'company', name: 'Initech LLC', properties: { plan: 'starter', industry: 'Consulting', employees: 45 } },
];

// ---------------------------------------------------------------------------
// Scenarios — 20 distinct user journeys
// ---------------------------------------------------------------------------

/**
 * Each scenario returns a list of event descriptors.
 * screen_view events use a `path` property (origin + pathname).
 */

const SCENARIOS = [
  // 1. Full e-commerce checkout success
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home', referrer: 'https://google.com' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'add_to_cart', props: { product_id: product.id, product_name: product.name, price: product.price, quantity: 1 } },
    { name: 'screen_view', props: { path: `${ORIGIN}/cart`, title: 'Cart' } },
    { name: 'checkout_started', props: { cart_total: product.price, item_count: 1 } },
    { name: 'screen_view', props: { path: `${ORIGIN}/checkout/shipping`, title: 'Shipping Info' } },
    { name: 'shipping_info_submitted', props: { shipping_method: 'standard', estimated_days: 5 } },
    { name: 'screen_view', props: { path: `${ORIGIN}/checkout/payment`, title: 'Payment' } },
    { name: 'payment_info_submitted', props: { payment_method: 'credit_card' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/checkout/review`, title: 'Order Review' } },
    { name: 'purchase', props: { order_id: `ord_${Date.now()}`, revenue: product.price, product_id: product.id, product_name: product.name, quantity: 1 }, revenue: true },
    { name: 'screen_view', props: { path: `${ORIGIN}/checkout/success`, title: 'Order Confirmed' } },
    { name: 'checkout_success', props: { order_id: `ord_${Date.now()}`, revenue: product.price } },
  ],

  // 2. Checkout failed (payment declined)
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'add_to_cart', props: { product_id: product.id, product_name: product.name, price: product.price, quantity: 1 } },
    { name: 'checkout_started', props: { cart_total: product.price, item_count: 1 } },
    { name: 'screen_view', props: { path: `${ORIGIN}/checkout/shipping`, title: 'Shipping Info' } },
    { name: 'shipping_info_submitted', props: { shipping_method: 'express', estimated_days: 2 } },
    { name: 'screen_view', props: { path: `${ORIGIN}/checkout/payment`, title: 'Payment' } },
    { name: 'payment_info_submitted', props: { payment_method: 'credit_card' } },
    { name: 'checkout_failed', props: { reason: 'payment_declined', error_code: 'insufficient_funds' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/checkout/payment`, title: 'Payment' } },
  ],

  // 3. Browse only — no purchase
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home', referrer: 'https://facebook.com' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/categories/${product.category.toLowerCase()}`, title: product.category } },
    { name: 'category_viewed', props: { category: product.category } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${PRODUCTS[1].id}`, title: PRODUCTS[1].name } },
    { name: 'product_viewed', props: { product_id: PRODUCTS[1].id, product_name: PRODUCTS[1].name, price: PRODUCTS[1].price, category: PRODUCTS[1].category } },
  ],

  // 4. Add to cart then abandon
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'add_to_cart', props: { product_id: product.id, product_name: product.name, price: product.price, quantity: 1 } },
    { name: 'screen_view', props: { path: `${ORIGIN}/cart`, title: 'Cart' } },
    { name: 'cart_abandoned', props: { cart_total: product.price, item_count: 1 } },
  ],

  // 5. Search → product → purchase
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
    { name: 'search', props: { query: product.name.split(' ')[0], result_count: randInt(3, 20) } },
    { name: 'screen_view', props: { path: `${ORIGIN}/search?q=${encodeURIComponent(product.name)}`, title: 'Search Results' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'add_to_cart', props: { product_id: product.id, product_name: product.name, price: product.price, quantity: 1 } },
    { name: 'checkout_started', props: { cart_total: product.price, item_count: 1 } },
    { name: 'shipping_info_submitted', props: { shipping_method: 'standard', estimated_days: 5 } },
    { name: 'payment_info_submitted', props: { payment_method: 'paypal' } },
    { name: 'purchase', props: { order_id: `ord_${Date.now()}`, revenue: product.price, product_id: product.id, product_name: product.name, quantity: 1 }, revenue: true },
    { name: 'checkout_success', props: { order_id: `ord_${Date.now()}`, revenue: product.price } },
  ],

  // 6. Sign up flow
  (_product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home', referrer: 'https://twitter.com' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/signup`, title: 'Sign Up' } },
    { name: 'signup_started', props: {} },
    { name: 'signup_step_completed', props: { step: 'email', step_number: 1 } },
    { name: 'signup_step_completed', props: { step: 'password', step_number: 2 } },
    { name: 'signup_step_completed', props: { step: 'profile', step_number: 3 } },
    { name: 'signup_completed', props: { method: 'email' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/dashboard`, title: 'Dashboard' } },
  ],

  // 7. Login → browse → wishlist
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/login`, title: 'Login' } },
    { name: 'login', props: { method: 'email' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'add_to_wishlist', props: { product_id: product.id, product_name: product.name, price: product.price } },
    { name: 'screen_view', props: { path: `${ORIGIN}/wishlist`, title: 'Wishlist' } },
  ],

  // 8. Promo code → purchase
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home', referrer: 'https://newsletter.example.com' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'add_to_cart', props: { product_id: product.id, product_name: product.name, price: product.price, quantity: 1 } },
    { name: 'checkout_started', props: { cart_total: product.price, item_count: 1 } },
    { name: 'promo_code_applied', props: { code: 'SAVE20', discount_percent: 20, discount_amount: Math.round(product.price * 0.2) } },
    { name: 'shipping_info_submitted', props: { shipping_method: 'standard', estimated_days: 5 } },
    { name: 'payment_info_submitted', props: { payment_method: 'credit_card' } },
    { name: 'purchase', props: { order_id: `ord_${Date.now()}`, revenue: Math.round(product.price * 0.8), product_id: product.id, product_name: product.name, quantity: 1, promo_code: 'SAVE20' }, revenue: true },
    { name: 'checkout_success', props: { order_id: `ord_${Date.now()}`, revenue: Math.round(product.price * 0.8) } },
  ],

  // 9. Multi-item purchase
  (_product) => {
    const p1 = PRODUCTS[0];
    const p2 = PRODUCTS[3];
    const total = p1.price + p2.price;
    return [
      { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
      { name: 'screen_view', props: { path: `${ORIGIN}/products/${p1.id}`, title: p1.name } },
      { name: 'product_viewed', props: { product_id: p1.id, product_name: p1.name, price: p1.price, category: p1.category } },
      { name: 'add_to_cart', props: { product_id: p1.id, product_name: p1.name, price: p1.price, quantity: 1 } },
      { name: 'screen_view', props: { path: `${ORIGIN}/products/${p2.id}`, title: p2.name } },
      { name: 'product_viewed', props: { product_id: p2.id, product_name: p2.name, price: p2.price, category: p2.category } },
      { name: 'add_to_cart', props: { product_id: p2.id, product_name: p2.name, price: p2.price, quantity: 1 } },
      { name: 'checkout_started', props: { cart_total: total, item_count: 2 } },
      { name: 'shipping_info_submitted', props: { shipping_method: 'express', estimated_days: 2 } },
      { name: 'payment_info_submitted', props: { payment_method: 'credit_card' } },
      { name: 'purchase', props: { order_id: `ord_${Date.now()}`, revenue: total, item_count: 2 }, revenue: true },
      { name: 'checkout_success', props: { order_id: `ord_${Date.now()}`, revenue: total } },
    ];
  },

  // 10. Help center visit
  (_product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/help`, title: 'Help Center' } },
    { name: 'help_search', props: { query: 'return policy', result_count: 4 } },
    { name: 'screen_view', props: { path: `${ORIGIN}/help/returns`, title: 'Return Policy' } },
    { name: 'help_article_read', props: { article: 'return_policy', time_on_page: randInt(60, 180) } },
    { name: 'screen_view', props: { path: `${ORIGIN}/help/shipping`, title: 'Shipping Info' } },
    { name: 'help_article_read', props: { article: 'shipping_times', time_on_page: randInt(30, 120) } },
  ],

  // 11. Product review submitted
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'review_started', props: { product_id: product.id } },
    { name: 'review_submitted', props: { product_id: product.id, rating: randInt(3, 5), has_text: true } },
  ],

  // 12. Newsletter signup only
  (_product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home', referrer: 'https://instagram.com' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/blog`, title: 'Blog' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/blog/top-10-gadgets-2024`, title: 'Top 10 Gadgets 2024' } },
    { name: 'newsletter_signup', props: { source: 'blog_article', campaign: 'gadgets_2024' } },
  ],

  // 13. Account settings update
  (_product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/login`, title: 'Login' } },
    { name: 'login', props: { method: 'google' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/account`, title: 'Account' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/account/settings`, title: 'Settings' } },
    { name: 'settings_updated', props: { field: 'notification_preferences', value: 'email_only' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/account/address`, title: 'Addresses' } },
    { name: 'address_added', props: { is_default: true } },
  ],

  // 14. Referral program engagement
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home', referrer: 'https://referral.example.com/?ref=abc123' } },
    { name: 'referral_link_clicked', props: { referrer_id: 'usr_ref123', campaign: 'summer_referral' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'add_to_cart', props: { product_id: product.id, product_name: product.name, price: product.price, quantity: 1 } },
    { name: 'checkout_started', props: { cart_total: product.price, item_count: 1 } },
    { name: 'shipping_info_submitted', props: { shipping_method: 'standard', estimated_days: 5 } },
    { name: 'payment_info_submitted', props: { payment_method: 'credit_card' } },
    { name: 'purchase', props: { order_id: `ord_${Date.now()}`, revenue: product.price, referral_code: 'abc123' }, revenue: true },
    { name: 'checkout_success', props: { order_id: `ord_${Date.now()}`, revenue: product.price } },
  ],

  // 15. Mobile quick browse — short session
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/categories/${product.category.toLowerCase()}`, title: product.category } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
  ],

  // 16. Compare products
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'compare_added', props: { product_id: product.id } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${PRODUCTS[4].id}`, title: PRODUCTS[4].name } },
    { name: 'product_viewed', props: { product_id: PRODUCTS[4].id, product_name: PRODUCTS[4].name, price: PRODUCTS[4].price, category: PRODUCTS[4].category } },
    { name: 'compare_added', props: { product_id: PRODUCTS[4].id } },
    { name: 'screen_view', props: { path: `${ORIGIN}/compare?ids=${product.id},${PRODUCTS[4].id}`, title: 'Compare Products' } },
    { name: 'compare_viewed', props: { product_ids: [product.id, PRODUCTS[4].id] } },
  ],

  // 17. Shipping failure retry → success
  (product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/products/${product.id}`, title: product.name } },
    { name: 'product_viewed', props: { product_id: product.id, product_name: product.name, price: product.price, category: product.category } },
    { name: 'add_to_cart', props: { product_id: product.id, product_name: product.name, price: product.price, quantity: 1 } },
    { name: 'checkout_started', props: { cart_total: product.price, item_count: 1 } },
    { name: 'screen_view', props: { path: `${ORIGIN}/checkout/shipping`, title: 'Shipping Info' } },
    { name: 'shipping_info_error', props: { error: 'invalid_address', attempt: 1 } },
    { name: 'shipping_info_submitted', props: { shipping_method: 'standard', estimated_days: 5, attempt: 2 } },
    { name: 'payment_info_submitted', props: { payment_method: 'credit_card' } },
    { name: 'purchase', props: { order_id: `ord_${Date.now()}`, revenue: product.price, product_id: product.id }, revenue: true },
    { name: 'checkout_success', props: { order_id: `ord_${Date.now()}`, revenue: product.price } },
  ],

  // 18. Subscription / SaaS upgrade
  (_product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/pricing`, title: 'Pricing' } },
    { name: 'pricing_viewed', props: {} },
    { name: 'plan_selected', props: { plan: 'pro', billing: 'annual', price: 9900 } },
    { name: 'screen_view', props: { path: `${ORIGIN}/checkout/subscription`, title: 'Subscribe' } },
    { name: 'payment_info_submitted', props: { payment_method: 'credit_card' } },
    { name: 'subscription_started', props: { plan: 'pro', billing: 'annual', revenue: 9900 }, revenue: true },
    { name: 'screen_view', props: { path: `${ORIGIN}/dashboard`, title: 'Dashboard' } },
  ],

  // 19. Deep content engagement (blog)
  (_product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/blog`, title: 'Blog', referrer: 'https://google.com' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/blog/buying-guide-headphones`, title: 'Headphones Buying Guide' } },
    { name: 'content_read', props: { article: 'headphones_buying_guide', reading_time: randInt(120, 480), scroll_depth: randFloat(0.6, 1.0) } },
    { name: 'screen_view', props: { path: `${ORIGIN}/blog/best-running-shoes-2024`, title: 'Best Running Shoes 2024' } },
    { name: 'content_read', props: { article: 'best_running_shoes_2024', reading_time: randInt(90, 300), scroll_depth: randFloat(0.5, 1.0) } },
  ],

  // 20. Error / 404 bounce
  (_product) => [
    { name: 'screen_view', props: { path: `${ORIGIN}/products/old-discontinued-product`, title: 'Product Not Found' } },
    { name: 'page_error', props: { error_code: 404, path: '/products/old-discontinued-product' } },
    { name: 'screen_view', props: { path: `${ORIGIN}/`, title: 'Home' } },
  ],
];

// ---------------------------------------------------------------------------
// Identity generation (deterministic by session index)
// ---------------------------------------------------------------------------

function generateIdentity(sessionIndex, sessionRng) {
  const firstName = pick(FIRST_NAMES, sessionRng);
  const lastName = pick(LAST_NAMES, sessionRng);
  const emailDomain = pick(EMAIL_DOMAINS, sessionRng);
  const profileId = `user_${String(sessionIndex + 1).padStart(4, '0')}`;
  return {
    profileId,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${sessionIndex}@${emailDomain}`,
  };
}

// Which sessions belong to which group (roughly 1/6 each)
function getGroupForSession(sessionIndex) {
  if (sessionIndex % 6 === 0) return GROUPS[0];
  if (sessionIndex % 6 === 1) return GROUPS[1];
  if (sessionIndex % 6 === 2) return GROUPS[2];
  return null;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function sendEvent(payload, ua, ip) {
  const headers = {
    'Content-Type': 'application/json',
    'user-agent': ua,
    'openpanel-client-id': CLIENT_ID,
    'x-forwarded-for': ip,
    origin: ORIGIN,
  };

  const res = await fetch(TRACK_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`  [WARN] ${res.status} ${payload.type}/${payload.payload?.name ?? ''}: ${text.slice(0, 120)}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Build session event list
// ---------------------------------------------------------------------------

function buildSession(sessionIndex) {
  const sessionRng = mulberry32(sessionIndex * 9973 + 1337); // deterministic per session

  const identity = generateIdentity(sessionIndex, sessionRng);
  const group = getGroupForSession(sessionIndex);
  const ua = makeUniqueUA(pick(USER_AGENTS, sessionRng), sessionIndex);
  const ip = makeIP(sessionIndex);
  const product = pick(PRODUCTS, sessionRng);
  const scenarioFn = SCENARIOS[sessionIndex % SCENARIOS.length];
  const events = scenarioFn(product);

  return { identity, group, ua, ip, events };
}

// ---------------------------------------------------------------------------
// Schedule events across timeline
// ---------------------------------------------------------------------------

function scheduleSession(session, sessionIndex, totalSessions) {
  const timelineMs = TIMELINE_MINUTES * 60 * 1000;
  const now = Date.now();

  // Sessions are spread across the timeline
  const sessionStartOffset = (sessionIndex / totalSessions) * timelineMs;
  const sessionStart = now - timelineMs + sessionStartOffset;

  // Events within session: spread over 2-10 minutes
  const sessionDurationMs = randInt(2, 10) * 60 * 1000;
  const eventCount = session.events.length;

  return session.events.map((event, i) => {
    const eventOffset = eventCount > 1 ? (i / (eventCount - 1)) * sessionDurationMs : 0;
    return {
      ...event,
      timestamp: Math.round(sessionStart + eventOffset),
    };
  });
}

// ---------------------------------------------------------------------------
// Concurrency limiter
// ---------------------------------------------------------------------------

async function withConcurrency(tasks, limit) {
  const results = [];
  const executing = [];
  for (const task of tasks) {
    const p = Promise.resolve().then(task);
    results.push(p);
    const e = p.then(() => executing.splice(executing.indexOf(e), 1));
    executing.push(e);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nSeeding ${SESSION_COUNT} sessions over ${TIMELINE_MINUTES} minutes`);
  console.log(`API: ${TRACK_URL}`);
  console.log(`Client ID: ${CLIENT_ID}\n`);

  let totalEvents = 0;
  let errors = 0;

  const sessionTasks = Array.from({ length: SESSION_COUNT }, (_, i) => async () => {
    const session = buildSession(i);
    const scheduledEvents = scheduleSession(session, i, SESSION_COUNT);
    const { identity, group, ua, ip } = session;

    // 1. Identify
    try {
      await sendEvent({ type: 'identify', payload: identity }, ua, ip);
    } catch (e) {
      errors++;
      console.error(`  [ERROR] identify session ${i}:`, e.message);
    }

    // 2. Group (if applicable)
    if (group) {
      try {
        await sendEvent({ type: 'group', payload: { ...group, profileId: identity.profileId } }, ua, ip);
      } catch (e) {
        errors++;
        console.error(`  [ERROR] group session ${i}:`, e.message);
      }
    }

    // 3. Track events in order
    for (const ev of scheduledEvents) {
      const trackPayload = {
        name: ev.name,
        profileId: identity.profileId,
        properties: {
          ...ev.props,
          __timestamp: new Date(ev.timestamp).toISOString(),
          ...(group ? { __group: group.id } : {}),
        },
        groups: group ? [group.id] : [],
      };

      if (ev.revenue) {
        trackPayload.properties.__revenue = ev.props.revenue;
      }

      try {
        await sendEvent({ type: 'track', payload: trackPayload }, ua, ip);
        totalEvents++;
      } catch (e) {
        errors++;
        console.error(`  [ERROR] track ${ev.name} session ${i}:`, e.message);
      }
    }

    if ((i + 1) % 50 === 0 || i + 1 === SESSION_COUNT) {
      console.log(`  Progress: ${i + 1}/${SESSION_COUNT} sessions`);
    }
  });

  await withConcurrency(sessionTasks, CONCURRENCY);

  console.log(`\nDone!`);
  console.log(`  Sessions: ${SESSION_COUNT}`);
  console.log(`  Events sent: ${totalEvents}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
