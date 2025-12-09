import { db } from '@openpanel/db';
import chalk from 'chalk';
import fuzzy from 'fuzzy';
import inquirer from 'inquirer';
import autocomplete from 'inquirer-autocomplete-prompt';
import { displayOrganizationDetails } from '../utils/display';

// Register autocomplete prompt
inquirer.registerPrompt('autocomplete', autocomplete);

interface OrgSearchItem {
  id: string;
  name: string;
  displayText: string;
}

export async function lookupByOrg() {
  console.log(chalk.blue('\n🏢 Lookup by Organization\n'));
  console.log('Loading organizations...\n');

  const organizations = await db.organization.findMany({
    orderBy: {
      name: 'asc',
    },
  });

  if (organizations.length === 0) {
    console.log(chalk.red('No organizations found.'));
    return;
  }

  const searchItems: OrgSearchItem[] = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    displayText: `${org.name} ${chalk.gray(`(${org.id})`)}`,
  }));

  const searchFunction = async (_answers: unknown, input = '') => {
    const fuzzyResult = fuzzy.filter(input, searchItems, {
      extract: (item: OrgSearchItem) => `${item.name} ${item.id}`,
    });

    return fuzzyResult.map((result: fuzzy.FilterResult<OrgSearchItem>) => ({
      name: result.original.displayText,
      value: result.original,
    }));
  };

  const { selectedOrg } = (await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'selectedOrg',
      message: 'Search for an organization:',
      source: searchFunction,
      pageSize: 15,
    },
  ])) as { selectedOrg: OrgSearchItem };

  // Fetch full organization details
  const organization = await db.organization.findUnique({
    where: {
      id: selectedOrg.id,
    },
    include: {
      projects: {
        include: {
          clients: true,
        },
        orderBy: {
          name: 'asc',
        },
      },
      members: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!organization) {
    console.log(chalk.red('Organization not found.'));
    return;
  }

  displayOrganizationDetails(organization);
}

