import { db } from '@openpanel/db';
import chalk from 'chalk';
import fuzzy from 'fuzzy';
import inquirer from 'inquirer';
import autocomplete from 'inquirer-autocomplete-prompt';
import { displayOrganizationDetails } from '../utils/display';

// Register autocomplete prompt
inquirer.registerPrompt('autocomplete', autocomplete);

interface EmailSearchItem {
  email: string;
  organizationId: string;
  organizationName: string;
  role: string;
  userId: string | null;
  displayText: string;
}

export async function lookupByEmail() {
  console.log(chalk.blue('\n📧 Lookup by Email\n'));
  console.log('Loading members...\n');

  const members = await db.member.findMany({
    include: {
      organization: true,
      user: true,
    },
    orderBy: {
      email: 'asc',
    },
  });

  if (members.length === 0) {
    console.log(chalk.red('No members found.'));
    return;
  }

  // Group by email (in case same email is in multiple orgs)
  const searchItems: EmailSearchItem[] = members.map((member) => {
    const email = member.user?.email || member.email || 'Unknown';
    const roleBadge =
      member.role === 'owner' ? '👑' : member.role === 'admin' ? '⭐' : '👤';

    return {
      email,
      organizationId: member.organizationId,
      organizationName: member.organization.name,
      role: member.role,
      userId: member.userId,
      displayText: `${email} ${chalk.gray(`→ ${member.organization.name}`)} ${roleBadge}`,
    };
  });

  const searchFunction = async (_answers: unknown, input = '') => {
    const fuzzyResult = fuzzy.filter(input, searchItems, {
      extract: (item: EmailSearchItem) =>
        `${item.email} ${item.organizationName}`,
    });

    return fuzzyResult.map((result: fuzzy.FilterResult<EmailSearchItem>) => ({
      name: result.original.displayText,
      value: result.original,
    }));
  };

  const { selectedMember } = (await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'selectedMember',
      message: 'Search for a member by email:',
      source: searchFunction,
      pageSize: 15,
    },
  ])) as { selectedMember: EmailSearchItem };

  // Fetch full organization details
  const organization = await db.organization.findUnique({
    where: {
      id: selectedMember.organizationId,
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

  console.log(
    chalk.yellow(
      `\nShowing organization for: ${selectedMember.email} (${selectedMember.role})\n`,
    ),
  );

  displayOrganizationDetails(organization);
}

