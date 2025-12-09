import { db } from '@openpanel/db';
import chalk from 'chalk';
import fuzzy from 'fuzzy';
import inquirer from 'inquirer';
import autocomplete from 'inquirer-autocomplete-prompt';
import { displayOrganizationDetails } from '../utils/display';

// Register autocomplete prompt
inquirer.registerPrompt('autocomplete', autocomplete);

interface ProjectSearchItem {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  displayText: string;
}

export async function lookupByProject() {
  console.log(chalk.blue('\n📊 Lookup by Project\n'));
  console.log('Loading projects...\n');

  const projects = await db.project.findMany({
    include: {
      organization: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  if (projects.length === 0) {
    console.log(chalk.red('No projects found.'));
    return;
  }

  const searchItems: ProjectSearchItem[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    organizationId: project.organizationId,
    organizationName: project.organization.name,
    displayText: `${project.organization.name} → ${project.name} ${chalk.gray(`(${project.id})`)}`,
  }));

  const searchFunction = async (_answers: unknown, input = '') => {
    const fuzzyResult = fuzzy.filter(input, searchItems, {
      extract: (item: ProjectSearchItem) =>
        `${item.organizationName} ${item.name} ${item.id}`,
    });

    return fuzzyResult.map((result: fuzzy.FilterResult<ProjectSearchItem>) => ({
      name: result.original.displayText,
      value: result.original,
    }));
  };

  const { selectedProject } = (await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'selectedProject',
      message: 'Search for a project:',
      source: searchFunction,
      pageSize: 15,
    },
  ])) as { selectedProject: ProjectSearchItem };

  // Fetch full organization details
  const organization = await db.organization.findUnique({
    where: {
      id: selectedProject.organizationId,
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
    highlightProjectId: selectedProject.id,
  });
}

