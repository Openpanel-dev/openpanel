import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import inquirer from 'inquirer';
import yaml from 'js-yaml';

let envs = {
  CLICKHOUSE_URL: '',
  REDIS_URL: '',
  DATABASE_URL: '',
  DOMAIN_NAME: '',
  COOKIE_SECRET: generatePassword(32),
  RESEND_API_KEY: '',
  EMAIL_SENDER: '',
};

type EnvVars = typeof envs;

const addEnvs = (env: Partial<EnvVars>) => {
  envs = {
    ...envs,
    ...env,
  };
};

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

function writeEnvFile(envs: EnvVars) {
  const envTemplatePath = path.resolve(__dirname, '.env.template');
  const envPath = path.resolve(__dirname, '.env');
  const envTemplate = fs.readFileSync(envTemplatePath, 'utf-8');

  const newEnvFile = envTemplate
    .replace('$COOKIE_SECRET', envs.COOKIE_SECRET)
    .replace('$CLICKHOUSE_URL', envs.CLICKHOUSE_URL)
    .replace('$REDIS_URL', envs.REDIS_URL)
    .replace('$DATABASE_URL', envs.DATABASE_URL)
    .replace('$DATABASE_URL_DIRECT', envs.DATABASE_URL)
    .replace('$NEXT_PUBLIC_DASHBOARD_URL', stripTrailingSlash(envs.DOMAIN_NAME))
    .replace(
      '$NEXT_PUBLIC_API_URL',
      `${stripTrailingSlash(envs.DOMAIN_NAME)}/api`,
    )
    .replace('$RESEND_API_KEY', envs.RESEND_API_KEY)
    .replace('$EMAIL_SENDER', envs.EMAIL_SENDER);

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
    'For more information you can read our article on self-hosting at https://openpanel.dev/docs/self-hosting/self-hosting\n',
    '',
    '',
    'Consider supporting us by becoming a supporter: https://openpanel.dev/supporter (pay what you want and help us keep the lights on)',
  ];

  console.log(
    '******************************************************************************\n',
  );
  console.log(message.join('\n'));
  console.log(
    '\n******************************************************************************',
  );

  // Domain name

  const domain = await inquirer.prompt([
    {
      type: 'input',
      name: 'DOMAIN_NAME',
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

  addEnvs(domain);

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

    addEnvs(clickhouseResponse);
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

    addEnvs(redisResponse);
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

    addEnvs(dbResponse);
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

  // OS

  const cpus = await inquirer.prompt([
    {
      type: 'input',
      name: 'CPUS',
      default: Math.max(Math.floor(os.cpus().length / 2), 1),
      message:
        'How many workers do you want to spawn (in many cases 1-2 is enough)?',
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

  const resend = await inquirer.prompt<{
    RESEND_API_KEY: string;
  }>([
    {
      type: 'input',
      name: 'RESEND_API_KEY',
      message: 'Enter your Resend API key (optional):',
    },
  ]);

  if (resend.RESEND_API_KEY) {
    const emailSender = await inquirer.prompt<{
      email: string;
    }>([
      {
        type: 'input',
        name: 'EMAIL_SENDER',
        default: `no-reply@${envs.DOMAIN_NAME.replace(/https?:\/\//, '')}`,
        message: 'The email which will be used to send out emails:',
        validate: (value) => {
          if (!value) {
            return 'Field is required';
          }

          if (!value.includes('@')) {
            return 'Please enter a valid email';
          }

          return true;
        },
      },
    ]);

    addEnvs({
      ...resend,
      ...emailSender,
    });
  }

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
    DOMAIN_NAME: envs.DOMAIN_NAME,
    COOKIE_SECRET: envs.COOKIE_SECRET,
    RESEND_API_KEY: envs.RESEND_API_KEY || '',
    EMAIL_SENDER: envs.EMAIL_SENDER || '',
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
    writeCaddyfile(envs.DOMAIN_NAME, basicAuth.password);
  }

  searchAndReplaceDockerCompose([['$OP_WORKER_REPLICAS', cpus.CPUS]]);

  console.log(
    [
      '======================================================================',
      'Here are some good things to know before you continue:',
      '',
      '1. Commands:',
      '\t- ./start (example: ./start)',
      '\t- ./stop (example: ./stop)',
      '\t- ./logs (example: ./logs)',
      '\t- ./rebuild (example: ./rebuild op-dashboard)',
      '\t- ./update (example: ./update) pulls the latest docker images and restarts the service',
      '',
      '2. Danger zone!',
      '\t- ./danger_wipe_everything (example: ./danger_wipe_everything)',
      '',
      '3. More about self-hosting: https://openpanel.dev/docs/self-hosting/self-hosting',
      '======================================================================',
      '',
      `Start OpenPanel with "./start" inside the self-hosting directory`,
      '',
      '',
    ].join('\n'),
  );
}

initiateOnboarding();
