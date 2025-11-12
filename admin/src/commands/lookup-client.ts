import { db } from '@openpanel/db';
import chalk from 'chalk';
import fuzzy from 'fuzzy';
import inquirer from 'inquirer';
import autocomplete from 'inquirer-autocomplete-prompt';
import { displayOrganizationDetails } from '../utils/display';

// Register autocomplete prompt
inquirer.registerPrompt('autocomplete', autocomplete);

interface ClientSearchItem {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  projectId: string | null;
  projectName: string | null;
  displayText: string;
}

export async function lookupByClient() {
  console.log(chalk.blue('\n🔑 Lookup by Client ID\n'));
  console.log('Loading clients...\n');

  const clients = await db.client.findMany({
    include: {
      organization: true,
      project: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  if (clients.length === 0) {
    console.log(chalk.red('No clients found.'));
    return;
  }

  const searchItems: ClientSearchItem[] = clients.map((client) => ({
    id: client.id,
    name: client.name,
    organizationId: client.organizationId,
    organizationName: client.organization.name,
    projectId: client.projectId,
    projectName: client.project?.name || null,
    displayText: `${client.organization.name} → ${client.project?.name || '[No Project]'} → ${client.name} ${chalk.gray(`(${client.id})`)}`,
  }));

  const searchFunction = async (_answers: unknown, input = '') => {
    const fuzzyResult = fuzzy.filter(input, searchItems, {
      extract: (item: ClientSearchItem) =>
        `${item.organizationName} ${item.projectName || ''} ${item.name} ${item.id}`,
    });

    return fuzzyResult.map((result: fuzzy.FilterResult<ClientSearchItem>) => ({
      name: result.original.displayText,
      value: result.original,
    }));
  };

  const { selectedClient } = (await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'selectedClient',
      message: 'Search for a client:',
      source: searchFunction,
      pageSize: 15,
    },
  ])) as { selectedClient: ClientSearchItem };

  // Fetch full organization details
  const organization = await db.organization.findUnique({
    where: {
      id: selectedClient.organizationId,
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

  displayOrganizationDetails(organization, {
    highlightProjectId: selectedClient.projectId || undefined,
    highlightClientId: selectedClient.id,
  });
}

