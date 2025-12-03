import {
  db,
  getOrganizationAccess,
  getOrganizationByProjectIdCached,
  getProjectAccess,
  getProjectByIdCached,
} from '@openpanel/db';
import chalk from 'chalk';
import fuzzy from 'fuzzy';
import inquirer from 'inquirer';
import autocomplete from 'inquirer-autocomplete-prompt';

// Register autocomplete prompt
inquirer.registerPrompt('autocomplete', autocomplete);

interface OrgSearchItem {
  id: string;
  name: string;
  displayText: string;
}

export async function clearCache() {
  console.log(chalk.blue('\n🗑️  Clear Cache\n'));
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

  // Fetch organization with all projects
  const organization = await db.organization.findUnique({
    where: {
      id: selectedOrg.id,
    },
    include: {
      projects: {
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

  console.log(chalk.yellow('\n📋 Organization Details:\n'));
  console.log(`  ${chalk.gray('ID:')} ${organization.id}`);
  console.log(`  ${chalk.gray('Name:')} ${organization.name}`);
  console.log(`  ${chalk.gray('Projects:')} ${organization.projects.length}`);

  if (organization.projects.length > 0) {
    console.log(chalk.yellow('\n📊 Projects:\n'));
    for (const project of organization.projects) {
      console.log(
        `  - ${project.name} ${chalk.gray(`(${project.id})`)} - ${chalk.cyan(`${project.eventsCount.toLocaleString()} events`)}`,
      );
    }
  }

  // Confirm before clearing cache
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Clear cache for organization "${organization.name}" and all ${organization.projects.length} projects?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('\nCache clear cancelled.'));
    return;
  }

  console.log(chalk.blue('\n🔄 Clearing cache...\n'));

  for (const project of organization.projects) {
    // Clear project access cache for each member
    for (const member of organization.members) {
      if (!member.user?.id) continue;
      console.log(
        `Clearing cache for project: ${project.name} and member: ${member.user?.email}`,
      );
      await getProjectAccess.clear({
        userId: member.user?.id,
        projectId: project.id,
      });
      await getOrganizationAccess.clear({
        userId: member.user?.id,
        organizationId: organization.id,
      });
    }

    console.log(`Clearing cache for project: ${project.name}`);
    await getOrganizationByProjectIdCached.clear(project.id);
    await getProjectByIdCached.clear(project.id);
  }

  console.log(chalk.gray(`Organization ID: ${organization.id}`));
  console.log(
    chalk.gray(
      `Project IDs: ${organization.projects.map((p) => p.id).join(', ')}`,
    ),
  );

  // Example of what you might do:
  /*
  for (const project of organization.projects) {
    console.log(`Clearing cache for project: ${project.name}...`);
    // await clearProjectCache(project.id);
    // await redis.del(`project:${project.id}:*`);
  }
  
  // Clear organization-level cache
  // await clearOrganizationCache(organization.id);
  // await redis.del(`organization:${organization.id}:*`);
  
  console.log(chalk.green('\n✅ Cache cleared successfully!'));
  */
}
