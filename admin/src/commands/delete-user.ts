import { db } from '@openpanel/db';
import chalk from 'chalk';
import fuzzy from 'fuzzy';
import inquirer from 'inquirer';
import autocomplete from 'inquirer-autocomplete-prompt';

// Register autocomplete prompt
inquirer.registerPrompt('autocomplete', autocomplete);

interface UserSearchItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayText: string;
}

export async function deleteUser() {
  console.log(chalk.red('\n🗑️  Delete User\n'));
  console.log(
    chalk.yellow(
      '⚠️  WARNING: This will permanently delete the user and remove them from all organizations!\n',
    ),
  );
  console.log('Loading users...\n');

  const users = await db.user.findMany({
    include: {
      membership: {
        include: {
          organization: true,
        },
      },
      accounts: true,
    },
    orderBy: {
      email: 'asc',
    },
  });

  if (users.length === 0) {
    console.log(chalk.red('No users found.'));
    return;
  }

  const searchItems: UserSearchItem[] = users.map((user) => {
    const fullName =
      user.firstName || user.lastName
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : '';
    const orgCount = user.membership.length;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayText: `${user.email} ${fullName ? chalk.gray(`(${fullName})`) : ''} ${chalk.cyan(`- ${orgCount} orgs`)}`,
    };
  });

  const searchFunction = async (_answers: unknown, input = '') => {
    const fuzzyResult = fuzzy.filter(input, searchItems, {
      extract: (item: UserSearchItem) =>
        `${item.email} ${item.firstName || ''} ${item.lastName || ''}`,
    });

    return fuzzyResult.map((result: fuzzy.FilterResult<UserSearchItem>) => ({
      name: result.original.displayText,
      value: result.original,
    }));
  };

  const { selectedUser } = (await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'selectedUser',
      message: 'Search for a user to delete:',
      source: searchFunction,
      pageSize: 15,
    },
  ])) as { selectedUser: UserSearchItem };

  // Fetch full user details
  const user = await db.user.findUnique({
    where: {
      id: selectedUser.id,
    },
    include: {
      membership: {
        include: {
          organization: true,
        },
      },
      accounts: true,
      createdOrganizations: true,
    },
  });

  if (!user) {
    console.log(chalk.red('User not found.'));
    return;
  }

  // Display what will be deleted
  console.log(chalk.red('\n⚠️  YOU ARE ABOUT TO DELETE:\n'));
  console.log(`  ${chalk.bold('User:')} ${user.email}`);
  if (user.firstName || user.lastName) {
    console.log(
      `  ${chalk.gray('Name:')} ${user.firstName || ''} ${user.lastName || ''}`,
    );
  }
  console.log(`  ${chalk.gray('ID:')} ${user.id}`);
  console.log(
    `  ${chalk.gray('Member of:')} ${user.membership.length} organizations`,
  );
  console.log(`  ${chalk.gray('Auth accounts:')} ${user.accounts.length}`);

  if (user.createdOrganizations.length > 0) {
    console.log(
      chalk.red(
        `\n  ⚠️  This user CREATED ${user.createdOrganizations.length} organization(s):`,
      ),
    );
    for (const org of user.createdOrganizations) {
      console.log(`    - ${org.name} ${chalk.gray(`(${org.id})`)}`);
    }
    console.log(
      chalk.yellow(
        '    Note: These organizations will NOT be deleted, only the user reference.',
      ),
    );
  }

  if (user.membership.length > 0) {
    console.log(
      chalk.red('\n  Organizations where user will be removed from:'),
    );
    for (const member of user.membership) {
      console.log(
        `    - ${member.organization.name} ${chalk.gray(`(${member.role})`)}`,
      );
    }
  }

  console.log(
    chalk.red(
      '\n⚠️  This will delete the user account, all sessions, and remove them from all organizations!',
    ),
  );

  // First confirmation
  const { confirmFirst } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmFirst',
      message: chalk.red(
        `Are you ABSOLUTELY SURE you want to delete user "${user.email}"?`,
      ),
      default: false,
    },
  ]);

  if (!confirmFirst) {
    console.log(chalk.yellow('\nDeletion cancelled.'));
    return;
  }

  // Second confirmation - type email
  const { confirmEmail } = await inquirer.prompt([
    {
      type: 'input',
      name: 'confirmEmail',
      message: `Type the user email "${user.email}" to confirm deletion:`,
    },
  ]);

  if (confirmEmail !== user.email) {
    console.log(chalk.red('\n❌ Email does not match. Deletion cancelled.'));
    return;
  }

  // Final confirmation
  const { confirmFinal } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmFinal',
      message: chalk.red(
        'FINAL WARNING: This action CANNOT be undone. Delete now?',
      ),
      default: false,
    },
  ]);

  if (!confirmFinal) {
    console.log(chalk.yellow('\nDeletion cancelled.'));
    return;
  }

  console.log(chalk.red('\n🗑️  Deleting user...\n'));

  try {
    // Delete the user (cascade will handle related records like sessions, accounts, memberships)
    await db.user.delete({
      where: {
        id: user.id,
      },
    });

    console.log(chalk.green('\n✅ User deleted successfully!'));
    console.log(
      chalk.gray(
        `Deleted: ${user.email} (removed from ${user.membership.length} organizations)`,
      ),
    );
  } catch (error) {
    console.error(chalk.red('\n❌ Error deleting user:'), error);
    throw error;
  }
}
