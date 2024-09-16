import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import inquirer from 'inquirer';
import yaml from 'js-yaml';

function generatePassword(length: number) {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0, n = charset.length; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  return password;
}

function writeCaddyfile(domainName: string, basicAuthPassword: string) {
  const caddyfileTemplatePath = path.resolve(
    __dirname,
    'caddy',
    'Caddyfile.template',
  );
  const caddyfilePath = path.resolve(__dirname, 'caddy', 'Caddyfile');
  fs.writeFileSync(
    caddyfilePath,
    fs
      .readFileSync(caddyfileTemplatePath, 'utf-8')
      .replaceAll('$DOMAIN_NAME', domainName.replace(/https?:\/\//, ''))
      .replaceAll(
        '$BASIC_AUTH_PASSWORD',
        bcrypt.hashSync(basicAuthPassword, 10),
      )
      .replaceAll(
        '$SSL_CONFIG',
        domainName.includes('localhost:443') ? '\n\ttls internal' : '',
      ),
  );
}

export interface DockerComposeFile {
  version: string;
  services: Record<
    string,
    {
      image: string;
      restart: string;
      ports: string[];
      volumes: string[];
      depends_on: string[];
    }
  >;
  volumes?: Record<string, unknown>;
}

const stripTrailingSlash = (str: string) =>
  str.endsWith('/') ? str.slice(0, -1) : str;

function searchAndReplaceDockerCompose(replacements: [string, string][]) {
  const dockerComposePath = path.resolve(__dirname, 'docker-compose.yml');
  const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf-8');
  const dockerComposeReplaced = replacements.reduce(
    (acc, [search, replace]) => acc.replaceAll(search, replace),
    dockerComposeContent,
  );

  fs.writeFileSync(dockerComposePath, dockerComposeReplaced);
}

function removeServiceFromDockerCompose(serviceName: string) {
  const dockerComposePath = path.resolve(__dirname, 'docker-compose.yml');
  const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf-8');

  // Parse the YAML file
  const dockerCompose = yaml.load(dockerComposeContent) as DockerComposeFile;

  // Remove the service
  if (dockerCompose.services[serviceName]) {
    delete dockerCompose.services[serviceName];
    console.log(`Service '${serviceName}' has been removed.`);
  } else {
    console.log(`Service '${serviceName}' not found.`);
    // return;
  }

  // filter depends_on
  Object.keys(dockerCompose.services).forEach((service) => {
    if (dockerCompose.services[service]?.depends_on) {
      // @ts-expect-error
      dockerCompose.services[service].depends_on = dockerCompose.services[
        service
      ].depends_on.filter((dep) => dep !== serviceName);
    }
  });

  // filter volumes
  Object.keys(dockerCompose.volumes ?? {}).forEach((volume) => {
    if (dockerCompose.volumes && volume.startsWith(serviceName)) {
      delete dockerCompose.volumes[volume];
    }
  });

  if (Object.keys(dockerCompose.volumes ?? {}).length === 0) {
    delete dockerCompose.volumes;
  }

  // Convert the object back to YAML
  const newYaml = yaml.dump(dockerCompose, {
    lineWidth: -1,
  });
  fs.writeFileSync(dockerComposePath, newYaml);
}

function writeEnvFile(envs: {
  CLICKHOUSE_URL: string;
  REDIS_URL: string;
  DATABASE_URL: string;
  DOMAIN_NAME: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
  CLERK_SIGNING_SECRET: string;
}) {
  const envTemplatePath = path.resolve(__dirname, '.env.template');
  const envPath = path.resolve(__dirname, '.env');
  const envTemplate = fs.readFileSync(envTemplatePath, 'utf-8');

  const newEnvFile = envTemplate
    .replace('$CLICKHOUSE_URL', envs.CLICKHOUSE_URL)
    .replace('$REDIS_URL', envs.REDIS_URL)
    .replace('$DATABASE_URL', envs.DATABASE_URL)
    .replace('$DATABASE_URL_DIRECT', envs.DATABASE_URL)
    .replace('$NEXT_PUBLIC_DASHBOARD_URL', stripTrailingSlash(envs.DOMAIN_NAME))
    .replace(
      '$NEXT_PUBLIC_API_URL',
      `${stripTrailingSlash(envs.DOMAIN_NAME)}/api`,
    )
    .replace(
      '$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      envs.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    )
    .replace('$CLERK_SECRET_KEY', envs.CLERK_SECRET_KEY)
    .replace('$CLERK_SIGNING_SECRET', envs.CLERK_SIGNING_SECRET);

  fs.writeFileSync(
    envPath,
    newEnvFile
      .split('\n')
      .filter((line) => {
        return !line.includes('=""');
      })
      .join('\n'),
  );
}

async function initiateOnboarding() {
  const T = '  ';
  const message = [
    '',
    'DISCLAIMER: This script is provided as-is and without warranty. Use at your own risk.',
    '',
    '',
    'WORTH MENTIONING: This is an early version of the script and it may not cover all scenarios.',
    '                  We recommend using our cloud service for production workloads until we release a stable version of self-hosting.',
    '',
    '',
    "With that said let's get started! 🤠",
    '',
    `Hey and welcome to Openpanel's self-hosting setup! 🚀\n`,
    'Before you continue, please make sure you have the following:',
    `${T}1. Docker and Docker Compose installed on your machine.`,
    `${T}2. A domain name that you can use for this setup and point it to this machine's ip`,
    `${T}3. A Clerk.com account`,
    `${T}${T}- If you don't have one, you can create one at https://clerk.dev`,
    `${T}${T}- We'll need NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, CLERK_SIGNING_SECRET`,
    `${T}${T}- Create a webhook pointing to https://your_domain/api/webhook/clerk\n`,
    'For more information you can read our article on self-hosting at https://docs.openpanel.dev/docs/self-hosting\n',
  ];

  console.log(
    '******************************************************************************\n',
  );
  console.log(message.join('\n'));
  console.log(
    '\n******************************************************************************',
  );

  // Domain name

  const domainNameResponse = await inquirer.prompt([
    {
      type: 'input',
      name: 'domainName',
      message: "What's the domain name you want to use?",
      default: process.env.DEBUG ? 'http://localhost' : undefined,
      prefix: '🌐',
      validate: (value) => {
        if (value.startsWith('http://') || value.startsWith('https://')) {
          return true;
        }

        return 'Please enter a valid domain name. Should start with "http://" or "https://"';
      },
    },
  ]);

  // Dependencies

  const dependenciesResponse = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'dependencies',
      message: 'Which of these dependencies will you need us to install?',
      choices: ['Clickhouse', 'Redis', 'Postgres'],
      default: ['Clickhouse', 'Redis', 'Postgres'],
      prefix: '📦',
    },
  ]);

  let envs: Record<string, string> = {};
  if (!dependenciesResponse.dependencies.includes('Clickhouse')) {
    const clickhouseResponse = await inquirer.prompt([
      {
        type: 'input',
        name: 'CLICKHOUSE_URL',
        message:
          'Enter your ClickHouse URL (format: http://user:pw@host:port/db):',
        default: process.env.DEBUG ? 'http://op-ch:8123/openpanel' : undefined,
      },
    ]);

    envs = {
      ...envs,
      ...clickhouseResponse,
    };
  }

  if (!dependenciesResponse.dependencies.includes('Redis')) {
    const redisResponse = await inquirer.prompt([
      {
        type: 'input',
        name: 'REDIS_URL',
        message: 'Enter your Redis URL (format: redis://user:pw@host:port/db):',
        default: process.env.DEBUG ? 'redis://op-kv:6379' : undefined,
      },
    ]);
    envs = {
      ...envs,
      ...redisResponse,
    };
  }

  if (!dependenciesResponse.dependencies.includes('Postgres')) {
    const dbResponse = await inquirer.prompt([
      {
        type: 'input',
        name: 'DATABASE_URL',
        message:
          'Enter your Database URL (format: postgresql://user:pw@host:port/db):',
        default: process.env.DEBUG
          ? 'postgresql://postgres:postgres@op-db:5432/postgres?schema=public'
          : undefined,
      },
    ]);
    envs = {
      ...envs,
      ...dbResponse,
    };
  }

  // Proxy

  const proxyResponse = await inquirer.prompt([
    {
      type: 'list',
      name: 'proxy',
      message:
        'Do you already have a web service setup or would you like us to install Caddy with SSL?',
      choices: ['Install Caddy with SSL', 'Bring my own'],
    },
  ]);

  // Clerk

  const clerkResponse = await inquirer.prompt([
    {
      type: 'input',
      name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      message: 'Enter your Clerk Publishable Key:',
      default: process.env.DEBUG ? 'pk_test_1234567890' : undefined,
      validate: (value) => {
        if (value.startsWith('pk_live_') || value.startsWith('pk_test_')) {
          return true;
        }

        return 'Please enter a valid Clerk Publishable Key. Should start with "pk_live_" or "pk_test_"';
      },
    },
    {
      type: 'input',
      name: 'CLERK_SECRET_KEY',
      message: 'Enter your Clerk Secret Key:',
      default: process.env.DEBUG ? 'sk_test_1234567890' : undefined,
      validate: (value) => {
        if (value.startsWith('sk_live_') || value.startsWith('sk_test_')) {
          return true;
        }

        return 'Please enter a valid Clerk Secret Key. Should start with "sk_live_" or "sk_test_"';
      },
    },
    {
      type: 'input',
      name: 'CLERK_SIGNING_SECRET',
      message: 'Enter your Clerk Signing Secret:',
      default: process.env.DEBUG ? 'whsec_1234567890' : undefined,
      validate: (value) => {
        if (value.startsWith('whsec_')) {
          return true;
        }

        return 'Please enter a valid Clerk Signing Secret. Should start with "whsec_"';
      },
    },
  ]);

  // OS

  const cpus = await inquirer.prompt([
    {
      type: 'input',
      name: 'CPUS',
      default: os.cpus().length,
      message: 'How many CPUs do you have?',
      validate: (value) => {
        const parsed = Number.parseInt(value, 10);

        if (Number.isNaN(parsed)) {
          return 'Please enter a valid number';
        }

        if (parsed < 1) {
          return 'Please enter a number greater than 0';
        }

        return true;
      },
    },
  ]);

  const basicAuth = await inquirer.prompt<{
    password: string;
  }>([
    {
      type: 'input',
      name: 'password',
      default: generatePassword(12),
      message: 'Give a password for basic auth',
      validate: (value) => {
        if (!value) {
          return 'Please enter a valid password';
        }

        if (value.length < 5) {
          return 'Password should be atleast 5 characters';
        }

        return true;
      },
    },
  ]);

  console.log('');
  console.log('Creating .env file...\n');

  writeEnvFile({
    CLICKHOUSE_URL: envs.CLICKHOUSE_URL || 'http://op-ch:8123/openpanel',
    REDIS_URL: envs.REDIS_URL || 'redis://op-kv:6379',
    DATABASE_URL:
      envs.DATABASE_URL ||
      'postgresql://postgres:postgres@op-db:5432/postgres?schema=public',
    DOMAIN_NAME: domainNameResponse.domainName,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      clerkResponse.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
    CLERK_SECRET_KEY: clerkResponse.CLERK_SECRET_KEY || '',
    CLERK_SIGNING_SECRET: clerkResponse.CLERK_SIGNING_SECRET || '',
  });

  console.log('Updating docker-compose.yml file...\n');
  fs.copyFileSync(
    path.resolve(__dirname, 'docker-compose.template.yml'),
    path.resolve(__dirname, 'docker-compose.yml'),
  );

  if (envs.CLICKHOUSE_URL) {
    removeServiceFromDockerCompose('op-ch');
    removeServiceFromDockerCompose('op-ch-migrator');
  }

  if (envs.REDIS_URL) {
    removeServiceFromDockerCompose('op-kv');
  }

  if (envs.DATABASE_URL) {
    removeServiceFromDockerCompose('op-db');
  }

  if (proxyResponse.proxy === 'Bring my own') {
    removeServiceFromDockerCompose('op-proxy');
  } else {
    writeCaddyfile(domainNameResponse.domainName, basicAuth.password);
  }

  searchAndReplaceDockerCompose([['$OP_WORKER_REPLICAS', cpus.CPUS]]);

  console.log(
    [
      '======================================================================',
      'Here are some good things to know before you continue:',
      '',
      `1. Make sure that your webhook is pointing at ${domainNameResponse.domainName}/api/webhook/clerk`,
      '',
      '2. Commands:',
      '\t- ./start (example: ./start)',
      '\t- ./stop (example: ./stop)',
      '\t- ./logs (example: ./logs)',
      '\t- ./rebuild (example: ./rebuild op-dashboard)',
      '',
      '3. Danger zone!',
      '\t- ./danger_wipe_everything (example: ./danger_wipe_everything)',
      '',
      '4. More about self-hosting: https://docs.openpanel.dev/docs/self-hosting',
      '======================================================================',
      '',
      `Start OpenPanel with "./start" inside the self-hosting directory`,
      '',
      '',
    ].join('\n'),
  );
}

initiateOnboarding();
