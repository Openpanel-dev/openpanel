import { Polar } from '@polar-sh/sdk';
import type { ProductCreate } from '@polar-sh/sdk/models/components/productcreate';
import inquirer from 'inquirer';
import { PRICING } from '../';

export function formatEventsCount(events: number) {
  return new Intl.NumberFormat('en-gb', {
    notation: 'compact',
  }).format(events);
}

interface Answers {
  isProduction: boolean;
  polarOrganizationId: string;
  polarApiKey: string;
}

async function promptForInput() {
  const answers = await inquirer.prompt<Answers>([
    {
      type: 'list',
      name: 'isProduction',
      message: 'Is this for production?',
      choices: [
        { name: 'Yes', value: true },
        { name: 'No', value: false },
      ],
      default: true,
    },
    {
      type: 'string',
      name: 'polarOrganizationId',
      message: 'Enter your Polar organization ID:',
    },
    {
      type: 'string',
      name: 'polarApiKey',
      message: 'Enter your Polar API key:',
      validate: (input: string) => {
        if (!input) return 'API key is required';
        return true;
      },
    },
  ]);

  return answers;
}

async function main() {
  const input = await promptForInput();

  const polar = new Polar({
    accessToken: input.polarApiKey!,
    server: input.isProduction ? 'production' : 'sandbox',
  });

  async function getProducts() {
    const products = await polar.products.list({
      limit: 100,
      isArchived: false,
      sorting: ['price_amount'],
    });
    return products.result.items.filter((product) => {
      return (
        product.metadata.custom !== 'true' && product.metadata.custom !== true
      );
    });
  }

  const isDry = process.argv.includes('--dry');
  const products = await getProducts();
  const createProducts = [];
  for (const price of PRICING) {
    if (price.price === 0) {
      const exists = products.find(
        (p) =>
          p.metadata?.eventsLimit === price.events &&
          p.recurringInterval === 'month',
      );
      if (exists) {
        console.log('Free product already exists:');
        console.log(' - ID:', exists.id);
        console.log(' - Name:', exists.name);
      } else {
        const product = await polar.products.create({
          organizationId: input.polarApiKey.includes('_oat_')
            ? undefined
            : input.polarOrganizationId,
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
        console.log('Free product created:');
        console.log(' - ID:', product.id);
        console.log(' - Name:', product.name);
      }

      continue;
    }

    const productCreate: ProductCreate = {
      organizationId: input.polarApiKey.includes('_oat_')
        ? undefined
        : input.polarOrganizationId,
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
          p.recurringInterval === 'month' &&
          p.name === productCreate.name,
      );
      const yearlyProductExists = products.find(
        (p) =>
          p.metadata?.eventsLimit === price.events &&
          p.recurringInterval === 'year' &&
          p.name === `${productCreate.name} (yearly)`,
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
        createProducts.push(monthlyProduct);
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
        // console.log('CREATE YEARLY', productCreate);
        const yearlyProduct = await polar.products.create(productCreate);
        console.log('Yearly product created:');
        console.log(' - ID:', yearlyProduct.id);
        console.log(' - Name:', yearlyProduct.name);
        console.log(' - Prices:', yearlyProduct.prices);
        console.log(' - Recurring Interval:', yearlyProduct.recurringInterval);
        console.log(' - Events Limit:', yearlyProduct.metadata?.eventsLimit);
        createProducts.push(yearlyProduct);
      }
    }
    console.log('---');
  }

  if (createProducts.length > 0) {
    console.log('Create below products:');
    for (const product of createProducts) {
      console.log('Product created:');
      console.log(' - ID:', product.id);
      console.log(' - Name:', product.name);
      console.log(' - Prices:', product.prices);
      console.log(' - Recurring Interval:', product.recurringInterval);
      console.log(' - Events Limit:', product.metadata?.eventsLimit);
    }
  }
}

main();
