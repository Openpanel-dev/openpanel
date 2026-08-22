import { Polar } from '@polar-sh/sdk';
import inquirer from 'inquirer';

// Creates the reusable save-offer discount used by the cancel flow: 30% off,
// repeating for the next 12 billing cycles. Run once per environment (sandbox +
// production) and put the printed ID in POLAR_SAVE_DISCOUNT_ID.
const DISCOUNT_NAME = 'Save offer — 30% off for 12 months';
const BASIS_POINTS = 3000;
const DURATION_IN_MONTHS = 12;

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
      type: 'password',
      mask: '*',
      name: 'polarApiKey',
      message: 'Enter your Polar API key:',
      validate: (input: string) => {
        if (!input) {
          return 'API key is required';
        }
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

  // The list response is a page iterator — walk every page so an existing
  // discount beyond the first page doesn't get duplicated.
  let match: { id: string; name: string } | undefined;
  const pages = await polar.discounts.list({ limit: 100 });
  for await (const page of pages) {
    match = page.result.items.find(
      (discount) => discount.name === DISCOUNT_NAME,
    );
    if (match) {
      break;
    }
  }

  if (match) {
    console.log('Save discount already exists:');
    console.log(' - ID:', match.id);
    console.log(' - Name:', match.name);
    console.log(`\nSet POLAR_SAVE_DISCOUNT_ID=${match.id}`);
    return;
  }

  const discount = await polar.discounts.create({
    organizationId: input.polarApiKey.includes('_oat_')
      ? undefined
      : input.polarOrganizationId,
    name: DISCOUNT_NAME,
    type: 'percentage',
    basisPoints: BASIS_POINTS,
    duration: 'repeating',
    durationInMonths: DURATION_IN_MONTHS,
  });

  console.log('Save discount created:');
  console.log(' - ID:', discount.id);
  console.log(' - Name:', discount.name);
  console.log(`\nSet POLAR_SAVE_DISCOUNT_ID=${discount.id}`);
}

main();
