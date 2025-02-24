import type { ProductCreate } from '@polar-sh/sdk/dist/commonjs/models/components/productcreate';
import { PRICING, getProducts, polar } from '../';

function formatEventsCount(events: number) {
  return new Intl.NumberFormat('en-gb', {
    notation: 'compact',
  }).format(events);
}

async function main() {
  const isDry = process.argv.includes('--dry');
  const products = await getProducts();
  for (const price of PRICING) {
    if (price.price === 0) {
      await polar.products.create({
        organizationId: process.env.POLAR_ORGANIZATION_ID!,
        name: `${formatEventsCount(price.events)} events per month (FREE)`,
        recurringInterval: 'month',
        prices: [
          {
            amountType: 'free',
          },
        ],
        metadata: {
          eventsLimit: price.events,
        },
      });
      continue;
    }

    const productCreate: ProductCreate = {
      organizationId: process.env.POLAR_ORGANIZATION_ID!,
      name: `${formatEventsCount(price.events)} events per month`,
      prices: [
        {
          priceAmount: price.price * 100,
          amountType: 'fixed',
          priceCurrency: 'usd',
        },
      ],
      recurringInterval: 'month',
      metadata: {
        eventsLimit: price.events,
      },
    };

    if (!isDry) {
      const monthlyProductExists = products.find(
        (p) =>
          p.metadata?.eventsLimit === price.events &&
          p.recurringInterval === 'month',
      );
      const yearlyProductExists = products.find(
        (p) =>
          p.metadata?.eventsLimit === price.events &&
          p.recurringInterval === 'year',
      );

      if (monthlyProductExists) {
        console.log('Monthly product already exists:');
        console.log(' - ID:', monthlyProductExists.id);
        console.log(' - Name:', monthlyProductExists.name);
        console.log(' - Prices:', monthlyProductExists.prices);
      } else {
        // monthly
        const monthlyProduct = await polar.products.create(productCreate);
        console.log('Monthly product created:');
        console.log(' - ID:', monthlyProduct.id);
        console.log(' - Name:', monthlyProduct.name);
        console.log(' - Prices:', monthlyProduct.prices);
        console.log(' - Recurring Interval:', monthlyProduct.recurringInterval);
        console.log(' - Events Limit:', monthlyProduct.metadata?.eventsLimit);
      }

      if (yearlyProductExists) {
        console.log('Yearly product already exists:');
        console.log(' - ID:', yearlyProductExists.id);
        console.log(' - Name:', yearlyProductExists.name);
        console.log(' - Prices:', yearlyProductExists.prices);
      } else {
        // yearly
        productCreate.name = `${productCreate.name} (yearly)`;
        productCreate.recurringInterval = 'year';
        if (
          productCreate.prices[0] &&
          'priceAmount' in productCreate.prices[0]
        ) {
          productCreate.prices[0]!.priceAmount = price.price * 100 * 10;
        }
        const yearlyProduct = await polar.products.create(productCreate);
        console.log('Yearly product created:');
        console.log(' - ID:', yearlyProduct.id);
        console.log(' - Name:', yearlyProduct.name);
        console.log(' - Prices:', yearlyProduct.prices);
        console.log(' - Recurring Interval:', yearlyProduct.recurringInterval);
        console.log(' - Events Limit:', yearlyProduct.metadata?.eventsLimit);
      }
    }
    console.log('---');
  }
}

main();
