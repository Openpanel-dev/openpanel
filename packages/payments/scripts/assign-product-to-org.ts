import { db } from '@openpanel/db';
import { Polar } from '@polar-sh/sdk';
import inquirer from 'inquirer';
import inquirerAutocomplete from 'inquirer-autocomplete-prompt';
import { getSuccessUrl } from '..';

// Register the autocomplete prompt
inquirer.registerPrompt('autocomplete', inquirerAutocomplete);

interface Answers {
  isProduction: boolean;
  polarApiKey: string;
  productId: string;
  organizationId: string;
}

async function promptForInput() {
  // Get all organizations first
  const organizations = await db.organization.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  // Step 1: Collect Polar credentials first
  const polarCredentials = await inquirer.prompt<{
    isProduction: boolean;
    polarApiKey: string;
    polarOrganizationId: string;
  }>([
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
      name: 'polarApiKey',
      message: 'Enter your Polar API key:',
      validate: (input: string) => {
        if (!input) return 'API key is required';
        return true;
      },
    },
  ]);

  // Step 2: Initialize Polar client and fetch products
  const polar = new Polar({
    accessToken: polarCredentials.polarApiKey,
    server: polarCredentials.isProduction ? 'production' : 'sandbox',
  });

  console.log('Fetching products from Polar...');
  const productsResponse = await polar.products.list({
    limit: 100,
    isArchived: false,
    sorting: ['price_amount'],
  });

  const products = productsResponse.result.items;

  if (products.length === 0) {
    throw new Error('No products found in Polar');
  }

  // Step 3: Continue with product selection and organization selection
  const restOfAnswers = await inquirer.prompt<{
    productId: string;
    organizationId: string;
  }>([
    {
      type: 'autocomplete',
      name: 'productId',
      message: 'Select product:',
      source: (answersSoFar: any, input = '') => {
        return products
          .filter(
            (product) =>
              product.name.toLowerCase().includes(input.toLowerCase()) ||
              product.id.toLowerCase().includes(input.toLowerCase()),
          )
          .map((product) => {
            const price = product.prices?.[0];
            const priceStr =
              price && 'priceAmount' in price && price.priceAmount
                ? `$${(price.priceAmount / 100).toFixed(2)}/${price.recurringInterval || 'month'}`
                : 'No price';
            return {
              name: `${product.name} (${priceStr})`,
              value: product.id,
            };
          });
      },
    },
    {
      type: 'autocomplete',
      name: 'organizationId',
      message: 'Select organization:',
      source: (answersSoFar: any, input = '') => {
        return organizations
          .filter(
            (org) =>
              org.name.toLowerCase().includes(input.toLowerCase()) ||
              org.id.toLowerCase().includes(input.toLowerCase()),
          )
          .map((org) => ({
            name: `${org.name} (${org.id})`,
            value: org.id,
          }));
      },
    },
  ]);

  return {
    ...polarCredentials,
    ...restOfAnswers,
  };
}

async function main() {
  console.log('Assigning existing product to organization...');
  const input = await promptForInput();

  const polar = new Polar({
    accessToken: input.polarApiKey,
    server: input.isProduction ? 'production' : 'sandbox',
  });

  const organization = await db.organization.findUniqueOrThrow({
    where: {
      id: input.organizationId,
    },
    select: {
      id: true,
      name: true,
      createdBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      projects: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!organization.createdBy) {
    throw new Error(
      `Organization ${organization.name} does not have a creator. Cannot proceed.`,
    );
  }

  const user = organization.createdBy;

  // Fetch product details for review
  const product = await polar.products.get({ id: input.productId });
  const price = product.prices?.[0];
  const priceStr =
    price && 'priceAmount' in price && price.priceAmount
      ? `$${(price.priceAmount / 100).toFixed(2)}/${price.recurringInterval || 'month'}`
      : 'No price';

  console.log('\nReview the following settings:');
  console.table({
    product: product.name,
    price: priceStr,
    organization: organization.name,
    email: user.email,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(' ') || 'No name',
  });

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Do you want to proceed?',
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log('Operation canceled');
    return;
  }

  const checkoutLink = await polar.checkoutLinks.create({
    paymentProcessor: 'stripe',
    productId: input.productId,
    allowDiscountCodes: false,
    metadata: {
      organizationId: organization.id,
      userId: user.id,
    },
    successUrl: getSuccessUrl(
      input.isProduction
        ? 'https://dashboard.openpanel.dev'
        : 'http://localhost:3000',
      organization.id,
    ),
  });

  console.log('\nCheckout link created:');
  console.table(checkoutLink);
  console.log('\nProduct assigned successfully!');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
