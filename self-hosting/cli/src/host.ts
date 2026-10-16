import { totalmem } from 'node:os';
import { run } from './run';

const BYTES_PER_GIB = 1024 ** 3;
// Redpanda is pinned to 2G of its own; the rest of the stack needs headroom.
const MIN_RAM_GIB = 4;

export interface HostCheck {
  id: string;
  ok: boolean;
  title: string;
  hint?: string;
}

const DOCKER_INSTALL_HINT =
  'Install Docker: https://docs.docker.com/engine/install/ (Linux: `curl -fsSL https://get.docker.com | sh`)';

export const checkHost = async (): Promise<HostCheck[]> => {
  const docker = await run(['docker', '--version']);
  if (docker.code !== 0) {
    return [
      {
        id: 'host/docker',
        ok: false,
        title: 'Docker is not installed',
        hint: DOCKER_INSTALL_HINT,
      },
    ];
  }

  const compose = await run(['docker', 'compose', 'version']);
  const daemon = await run(['docker', 'info']);
  const ramGiB = totalmem() / BYTES_PER_GIB;

  return [
    { id: 'host/docker', ok: true, title: docker.stdout.trim() },
    {
      id: 'host/compose',
      ok: compose.code === 0,
      title:
        compose.code === 0
          ? compose.stdout.trim()
          : 'Docker Compose v2 is missing',
      hint: 'Install the compose plugin: https://docs.docker.com/compose/install/',
    },
    {
      id: 'host/daemon',
      ok: daemon.code === 0,
      title:
        daemon.code === 0
          ? 'Docker daemon is reachable'
          : 'Cannot reach the Docker daemon',
      hint: 'Start Docker, or add your user to the docker group: `sudo usermod -aG docker $USER` and log in again.',
    },
    {
      id: 'host/memory',
      ok: ramGiB >= MIN_RAM_GIB,
      title: `${ramGiB.toFixed(1)} GiB RAM (need ${MIN_RAM_GIB}+)`,
      hint: 'Redpanda, ClickHouse and Postgres together need at least 4 GiB.',
    },
  ];
};

// Offered only on Linux: Docker's own script, shown to the user before it runs.
export const DOCKER_INSTALL_COMMAND = [
  'sh',
  '-c',
  'curl -fsSL https://get.docker.com | sh',
];
