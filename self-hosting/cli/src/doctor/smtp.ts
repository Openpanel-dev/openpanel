import { connect } from 'node:net';
import type { EnvFile } from '../env-file';
import type { Finding } from './types';

export const SMTP_STARTTLS_CHECK_ID = 'env/smtp-starttls';
const DEFAULT_SMTP_PORT = 587;
const PROBE_TIMEOUT_MS = 5000;
// The last line of a (possibly multi-line) SMTP reply has a space after the code.
const FINAL_REPLY_LINE = /^\d{3} /m;
const STARTTLS_EXTENSION = /^250[ -]STARTTLS\b/im;
const SMTP_READY = '220';
const SMTP_OK = '250';

type Probe =
  | { reachable: true; offersStartTls: boolean }
  | { reachable: false; reason: string };

// Reads the greeting, sends EHLO and reports whether STARTTLS is advertised.
// Never starts TLS or authenticates: no credentials leave the machine.
export const probeStartTls = ({
  host,
  port,
  timeoutMs,
}: {
  host: string;
  port: number;
  timeoutMs: number;
}): Promise<Probe> =>
  new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (probe: Probe) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(probe);
    };
    const timer = setTimeout(
      () =>
        finish({ reachable: false, reason: `no reply within ${timeoutMs} ms` }),
      timeoutMs
    );
    let reply = '';
    let hasGreeted = false;
    socket.setEncoding('utf8');
    socket.on('error', (error) =>
      finish({ reachable: false, reason: error.message })
    );
    socket.on('close', () =>
      finish({ reachable: false, reason: 'the server closed the connection' })
    );
    socket.on('data', (chunk: string) => {
      reply += chunk;
      if (!FINAL_REPLY_LINE.test(reply)) {
        return;
      }
      if (!hasGreeted) {
        if (!reply.startsWith(SMTP_READY)) {
          finish({
            reachable: false,
            reason: `unexpected greeting: ${reply.trim()}`,
          });
          return;
        }
        hasGreeted = true;
        reply = '';
        socket.write('EHLO openpanel-doctor\r\n');
        return;
      }
      if (!reply.startsWith(SMTP_OK)) {
        finish({ reachable: false, reason: `EHLO failed: ${reply.trim()}` });
        return;
      }
      const offersStartTls = STARTTLS_EXTENSION.test(reply);
      socket.write('QUIT\r\n');
      finish({ reachable: true, offersStartTls });
    });
  });

// The api requires STARTTLS whenever it authenticates without implicit TLS
// (packages/email createSmtpTransport); an unauthenticated relay is exempt.
export const smtpStartTls = async (
  env: EnvFile,
  { timeoutMs = PROBE_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<Finding | null> => {
  const host = env.get('SMTP_HOST');
  const authenticates = Boolean(env.get('SMTP_USER') && env.get('SMTP_PASS'));
  const usesImplicitTls = env.get('SMTP_SECURE') === 'true';
  if (!(host && authenticates) || usesImplicitTls) {
    return null;
  }
  const port = Number(env.get('SMTP_PORT') ?? DEFAULT_SMTP_PORT);
  const address = `${host}:${port}`;
  const probe = Number.isInteger(port)
    ? await probeStartTls({ host, port, timeoutMs })
    : { reachable: false as const, reason: 'SMTP_PORT is not a number' };

  if (!probe.reachable) {
    return {
      id: SMTP_STARTTLS_CHECK_ID,
      severity: 'warn',
      title: `Could not check STARTTLS on ${address}`,
      detail: `${probe.reason}. Doctor connects from this machine, so a host only the containers can reach (a compose service name) cannot be checked here.`,
      manual:
        'Make sure the server offers STARTTLS on this port, or set SMTP_SECURE=true with SMTP_PORT=465: the api no longer sends SMTP credentials without TLS.',
    };
  }
  if (probe.offersStartTls) {
    return null;
  }
  return {
    id: SMTP_STARTTLS_CHECK_ID,
    severity: 'error',
    title: `${address} does not offer STARTTLS`,
    detail:
      'With SMTP_USER and SMTP_PASS set and SMTP_SECURE not `true`, the api refuses to send credentials over an unencrypted connection, so every email fails.',
    manual:
      'Set SMTP_SECURE=true with SMTP_PORT=465, or point SMTP_HOST at a server that supports STARTTLS.',
  };
};
