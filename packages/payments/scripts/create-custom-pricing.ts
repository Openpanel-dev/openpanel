import { db } from '@openpanel/db';
import { Polar } from '@polar-sh/sdk';
import type { ProductCreate } from '@polar-sh/sdk/models/components/productcreate';
import inquirer from 'inquirer';
import inquirerAutocomplete from 'inquirer-autocomplete-prompt';
import { PRICING, getProducts, getSuccessUrl, polar } from '..';
import { formatEventsCount } from './create-products';

// Register the autocomplete prompt
inquirer.registerPrompt('autocomplete', inquirerAutocomplete);

type Interval = 'month' | 'year';

interface Answers {
  isProduction: boolean;
  organizationId: string;
  userId: string;
  interval: Interval;
  price: number;
  eventsLimit: number;
  polarOrganizationId: string;
  polarApiKey: string;
}

async function promptForInput() {
  // Get all organizations first
  const organizations = await db.organization.findMany({
    select: {
      id: true,
      name: true,
    },
  });

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
      source: (answersSoFar: Answers, input = '') => {
        return db.organization
          .findFirst({
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
          })
          .then((org) =>
            org?.members
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
              })),
          );
      },
    },
    {
      type: 'list',
      name: 'interval',
      message: 'Select billing interval:',
      choices: [
        { name: 'Monthly', value: 'month' },
        { name: 'Yearly', value: 'year' },
      ],
    },
    {
      type: 'number',
      name: 'price',
      message: 'Enter price',
      validate: (input: number) => {
        if (!Number.isInteger(input)) return false;
        if (input < 0) return false;
        return true;
      },
    },
    {
      type: 'number',
      name: 'eventsLimit',
      message: 'Enter events limit:',
      validate: (input: number) => {
        if (!Number.isInteger(input)) return false;
        if (input < 0) return false;
        return true;
      },
    },
  ]);

  return answers;
}

async function main() {
  console.log('Creating custom pricing...');
  const input = await promptForInput();

  const polar = new Polar({
    accessToken: input.polarApiKey!,
    server: input.isProduction ? 'production' : 'sandbox',
  });

  const organization = await db.organization.findUniqueOrThrow({
    where: {
      id: input.organizationId,
    },
    select: {
      id: true,
      name: true,
      projects: {
        select: {
          id: true,
        },
      },
    },
  });

  const user = await db.user.findUniqueOrThrow({
    where: {
      id: input.userId,
    },
  });

  console.log('\nReview the following settings:');
  console.table({
    ...input,
    organization: organization?.name,
    email: user?.email,
    name:
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'No name',
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

  const product = await polar.products.create({
    organizationId: input.polarApiKey.includes('_oat_')
      ? undefined
      : input.polarOrganizationId,
    name: `Custom product for ${organization.name}`,
    recurringInterval: 'month',
    prices: [
      {
        amountType: 'fixed',
        priceAmount: input.price * 100,
      },
    ],
    metadata: {
      eventsLimit: input.eventsLimit,
      organizationId: organization.id,
      userId: user.id,
      custom: true,
    },
  });

  const checkoutLink = await polar.checkoutLinks.create({
    productId: product.id,
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
      organization.projects[0]?.id,
    ),
  });

  console.table(checkoutLink);
  console.log('Custom pricing created successfully!');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
