import { db } from '@openpanel/db';
import { Polar } from '@polar-sh/sdk';
import inquirer from 'inquirer';
import inquirerAutocomplete from 'inquirer-autocomplete-prompt';
import { getSuccessUrl } from '..';

// Register the autocomplete prompt
inquirer.registerPrompt('autocomplete', inquirerAutocomplete);

interface Answers {
  organizationId: string;
  userId: string;
  productId: string;
}

async function promptForInput(polar: Polar) {
  // Get all organizations first
  const organizations = await db.organization.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  // Fetch all products from Polar
  let products: any[] = [];
  try {
    const productsResponse = await polar.products.list({
      limit: 100,
      isArchived: false,
      sorting: ['price_amount'],
    });
    products = productsResponse.result.items;
    
    if (products.length === 0) {
      console.warn('Warning: No products found in Polar');
    }
  } catch (error) {
    console.error('Error fetching products from Polar:', error);
    throw new Error('Failed to fetch products. Please check your API key and try again.');
  }

  const answers = await inquirer.prompt<Answers>([
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
            const price = product.prices[0];
            const priceDisplay = price
              ? `$${(price.priceAmount / 100).toFixed(2)}`
              : 'Free';
            return {
              name: `${product.name} - ${priceDisplay} (${product.id})`,
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
    {
      type: 'autocomplete',
      name: 'userId',
      message: 'Select user:',
      source: async (answersSoFar: Answers, input = '') => {
        if (!answersSoFar.organizationId) {
          return [];
        }
        try {
          const org = await db.organization.findFirst({
            where: {
              id: answersSoFar.organizationId,
            },
            include: {
              members: {
                select: {
                  role: true,
                  user: true,
                },
              },
            },
          });
          
          if (!org || !org.members || org.members.length === 0) {
            return [{ name: 'No members found', value: '', disabled: true }];
          }
          
          return org.members
            .filter(
              (member) =>
                member.user?.email
                  .toLowerCase()
                  .includes(input.toLowerCase()) ||
                member.user?.firstName
                  ?.toLowerCase()
                  .includes(input.toLowerCase()),
            )
            .map((member) => ({
              name: `${
                [member.user?.firstName, member.user?.lastName]
                  .filter(Boolean)
                  .join(' ') || 'No name'
              } (${member.user?.email}) [${member.role}]`,
              value: member.user?.id,
            }));
        } catch (error) {
          console.error('Error fetching organization members:', error);
          return [{ name: 'Error loading members', value: '', disabled: true }];
        }
      },
    },
  ]);

  return answers;
}

async function main() {
  try {
    console.log('Creating checkout link...');

    // First, get environment and API key to initialize Polar client
    const { isProduction, polarApiKey } = await inquirer.prompt([
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

    const polar = new Polar({
      accessToken: polarApiKey!,
      server: isProduction ? 'production' : 'sandbox',
    });

    const input = await promptForInput(polar);

    const organization = await db.organization.findUniqueOrThrow({
      where: {
        id: input.organizationId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const user = await db.user.findUniqueOrThrow({
      where: {
        id: input.userId,
      },
    });

    const product = await polar.products.get({ id: input.productId });

    console.log('\nReview the following settings:');
    console.table({
      environment: isProduction ? 'Production' : 'Sandbox',
      organization: organization.name,
      product: product.name,
      productId: product.id,
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

    const checkout = await polar.checkouts.create({
      products: [input.productId],
      successUrl: getSuccessUrl(
        isProduction
          ? 'https://dashboard.openpanel.dev'
          : 'http://localhost:3000',
        organization.id,
      ),
      customerEmail: user.email,
      customerName: [user.firstName, user.lastName].filter(Boolean).join(' '),
      metadata: {
        organizationId: organization.id,
        userId: user.id,
      },
    });

    console.log('\nCheckout link created successfully!');
    console.table({
      url: checkout.url,
      id: checkout.id,
    });
  } catch (error) {
    console.error('Error creating checkout link:', error);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
