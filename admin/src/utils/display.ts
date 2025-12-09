import type {
  Client,
  Member,
  Organization,
  Project,
  User,
} from '@openpanel/db';
import chalk from 'chalk';

type OrganizationWithDetails = Organization & {
  projects: (Project & {
    clients: Client[];
  })[];
  members: (Member & {
    user: User | null;
  })[];
};

interface DisplayOptions {
  highlightProjectId?: string;
  highlightClientId?: string;
}

export function displayOrganizationDetails(
  organization: OrganizationWithDetails,
  options: DisplayOptions = {},
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(chalk.bold.yellow(`\n📊 ORGANIZATION: ${organization.name}`));
  console.log(`${'='.repeat(80)}\n`);

  // Organization Details
  console.log(chalk.bold('Organization Details:'));
  console.log(`  ${chalk.gray('ID:')} ${organization.id}`);
  console.log(`  ${chalk.gray('Name:')} ${organization.name}`);
  console.log(
    `  ${chalk.gray('Created:')} ${organization.createdAt.toISOString()}`,
  );
  console.log(`  ${chalk.gray('Timezone:')} ${organization.timezone || 'UTC'}`);

  // Subscription info
  if (organization.subscriptionStatus) {
    console.log(
      `  ${chalk.gray('Subscription Status:')} ${getSubscriptionStatusColor(organization.subscriptionStatus)}`,
    );
    if (organization.subscriptionPriceId) {
      console.log(
        `  ${chalk.gray('Price ID:')} ${organization.subscriptionPriceId}`,
      );
    }
    if (organization.subscriptionPeriodEventsLimit) {
      const usage = `${organization.subscriptionPeriodEventsCount}/${organization.subscriptionPeriodEventsLimit}`;
      const percentage =
        (organization.subscriptionPeriodEventsCount /
          organization.subscriptionPeriodEventsLimit) *
        100;
      const color =
        percentage > 90
          ? chalk.red
          : percentage > 70
            ? chalk.yellow
            : chalk.green;
      console.log(
        `  ${chalk.gray('Event Usage:')} ${color(usage)} (${percentage.toFixed(1)}%)`,
      );
    }
    if (organization.subscriptionStartsAt) {
      console.log(
        `  ${chalk.gray('Starts:')} ${organization.subscriptionStartsAt.toISOString()}`,
      );
    }
    if (organization.subscriptionEndsAt) {
      console.log(
        `  ${chalk.gray('Ends:')} ${organization.subscriptionEndsAt.toISOString()}`,
      );
    }
  }

  if (organization.deleteAt) {
    console.log(
      `  ${chalk.red.bold('⚠️  Scheduled for deletion:')} ${organization.deleteAt.toISOString()}`,
    );
  }

  // Members
  console.log(`\n${chalk.bold('Members:')}`);
  if (organization.members.length === 0) {
    console.log('  No members');
  } else {
    for (const member of organization.members) {
      const roleBadge = getRoleBadge(member.role);
      console.log(
        `  ${roleBadge} ${member.user?.email || member.email || 'Unknown'} ${chalk.gray(`(${member.role})`)}`,
      );
    }
  }

  // Projects
  console.log(`\n${chalk.bold(`Projects (${organization.projects.length}):`)}`);

  if (organization.projects.length === 0) {
    console.log('  No projects');
  } else {
    for (const project of organization.projects) {
      const isHighlighted = project.id === options.highlightProjectId;
      const projectPrefix = isHighlighted ? chalk.yellow.bold('→ ') : '  ';

      console.log(`\n${projectPrefix}${chalk.bold.green(project.name)}`);
      console.log(`    ${chalk.gray('ID:')} ${project.id}`);
      console.log(
        `    ${chalk.gray('Events Count:')} ${project.eventsCount.toLocaleString()}`,
      );

      if (project.domain) {
        console.log(`    ${chalk.gray('Domain:')} ${project.domain}`);
      }

      if (project.cors.length > 0) {
        console.log(`    ${chalk.gray('CORS:')} ${project.cors.join(', ')}`);
      }

      console.log(
        `    ${chalk.gray('Cross Domain:')} ${project.crossDomain ? chalk.green('✓') : chalk.red('✗')}`,
      );
      console.log(
        `    ${chalk.gray('Created:')} ${project.createdAt.toISOString()}`,
      );

      if (project.deleteAt) {
        console.log(
          `    ${chalk.red.bold('⚠️  Scheduled for deletion:')} ${project.deleteAt.toISOString()}`,
        );
      }

      // Clients for this project
      if (project.clients.length > 0) {
        console.log(`    ${chalk.gray('Clients:')}`);
        for (const client of project.clients) {
          const isClientHighlighted = client.id === options.highlightClientId;
          const clientPrefix = isClientHighlighted
            ? chalk.yellow.bold('    → ')
            : '      ';
          const typeBadge = getClientTypeBadge(client.type);

          console.log(`${clientPrefix}${typeBadge} ${chalk.cyan(client.name)}`);
          console.log(`        ${chalk.gray('ID:')} ${client.id}`);
          console.log(`        ${chalk.gray('Type:')} ${client.type}`);
          console.log(
            `        ${chalk.gray('Has Secret:')} ${client.secret ? chalk.green('✓') : chalk.red('✗')}`,
          );
          console.log(
            `        ${chalk.gray('Ignore CORS/Secret:')} ${client.ignoreCorsAndSecret ? chalk.yellow('✓') : chalk.gray('✗')}`,
          );
        }
      } else {
        console.log(`    ${chalk.gray('Clients:')} None`);
      }
    }
  }

  // Clients without projects (organization-level clients)
  const orgLevelClients = organization.projects.length > 0 ? [] : []; // We need to query these separately

  console.log(`\n${'='.repeat(80)}\n`);
}

function getSubscriptionStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return chalk.green(status);
    case 'trialing':
      return chalk.blue(status);
    case 'canceled':
      return chalk.red(status);
    case 'past_due':
      return chalk.yellow(status);
    default:
      return chalk.gray(status);
  }
}

function getRoleBadge(role: string): string {
  switch (role) {
    case 'owner':
      return chalk.red.bold('👑');
    case 'admin':
      return chalk.yellow.bold('⭐');
    case 'member':
      return chalk.blue('👤');
    default:
      return chalk.gray('•');
  }
}

function getClientTypeBadge(type: string): string {
  switch (type) {
    case 'root':
      return chalk.red.bold('[ROOT]');
    case 'write':
      return chalk.green('[WRITE]');
    case 'read':
      return chalk.blue('[READ]');
    default:
      return chalk.gray('[UNKNOWN]');
  }
}
