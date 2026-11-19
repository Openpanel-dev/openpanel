import { afterEach, describe, expect, test } from 'bun:test';
import { type AddressInfo, createServer, type Server } from 'node:net';
import { smtpStartTls } from '../src/doctor';
import { EnvFile } from '../src/env-file';

const SHORT_TIMEOUT_MS = 300;
const servers: Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

// Answers the greeting and EHLO the way a real server does, multi-line replies
// included, and counts connections so a skipped check can prove it never dialed.
const fakeSmtp = async ({
  greeting = '220-mail.test ESMTP\r\n220 ready\r\n',
  extensions,
  ehloReply,
}: {
  greeting?: string | null;
  extensions: string[];
  ehloReply?: string;
}) => {
  const state = { connections: 0, port: 0 };
  const server = createServer((socket) => {
    state.connections += 1;
    if (greeting !== null) {
      socket.write(greeting);
    }
    socket.on('data', (data) => {
      if (!data.toString().startsWith('EHLO')) {
        return;
      }
      if (ehloReply) {
        socket.write(ehloReply);
        return;
      }
      const lines = ['mail.test', ...extensions];
      const reply = lines
        .map((line, index) => {
          const separator = index === lines.length - 1 ? ' ' : '-';
          return `250${separator}${line}\r\n`;
        })
        .join('');
      socket.write(reply);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.port = (server.address() as AddressInfo).port;
  return state;
};

const envFor = (port: number, extra = '') =>
  new EnvFile(
    `SMTP_HOST=127.0.0.1\nSMTP_PORT=${port}\nSMTP_USER=mailer\nSMTP_PASS=secret\n${extra}`
  );

describe('smtp STARTTLS check', () => {
  test('passes when EHLO advertises STARTTLS', async () => {
    const server = await fakeSmtp({ extensions: ['PIPELINING', 'STARTTLS'] });
    expect(await smtpStartTls(envFor(server.port))).toBeNull();
    expect(server.connections).toBe(1);
  });

  test('is an error when EHLO does not advertise STARTTLS', async () => {
    const server = await fakeSmtp({ extensions: ['PIPELINING', 'AUTH PLAIN'] });
    const finding = await smtpStartTls(envFor(server.port));
    expect(finding?.severity).toBe('error');
    expect(finding?.id).toBe('env/smtp-starttls');
  });

  test('skips without credentials, with implicit TLS, or without SMTP', async () => {
    const server = await fakeSmtp({ extensions: [] });
    const unauthenticated = new EnvFile(
      `SMTP_HOST=127.0.0.1\nSMTP_PORT=${server.port}\nSMTP_USER=mailer\n`
    );
    expect(await smtpStartTls(unauthenticated)).toBeNull();
    expect(
      await smtpStartTls(envFor(server.port, 'SMTP_SECURE=true\n'))
    ).toBeNull();
    expect(await smtpStartTls(new EnvFile('SMTP_USER=a\nSMTP_PASS=b\n'))).toBe(
      null
    );
    expect(server.connections).toBe(0);
  });

  test('still probes when SMTP_SECURE is anything but true', async () => {
    const server = await fakeSmtp({ extensions: [] });
    const finding = await smtpStartTls(
      envFor(server.port, 'SMTP_SECURE=false\n')
    );
    expect(finding?.severity).toBe('error');
  });

  test('warns when the server refuses EHLO', async () => {
    const server = await fakeSmtp({
      extensions: [],
      ehloReply: '502 5.5.2 command not recognized\r\n',
    });
    const finding = await smtpStartTls(envFor(server.port));
    expect(finding?.severity).toBe('warn');
  });

  test('warns when nothing listens on the port', async () => {
    const server = await fakeSmtp({ extensions: [] });
    const { port } = server;
    servers.pop()?.close();
    await Bun.sleep(10);
    const finding = await smtpStartTls(envFor(port), {
      timeoutMs: SHORT_TIMEOUT_MS,
    });
    expect(finding?.severity).toBe('warn');
  });

  test('warns when the server never greets', async () => {
    const server = await fakeSmtp({ greeting: null, extensions: [] });
    const finding = await smtpStartTls(envFor(server.port), {
      timeoutMs: SHORT_TIMEOUT_MS,
    });
    expect(finding?.severity).toBe('warn');
    expect(finding?.detail).toContain(`${SHORT_TIMEOUT_MS} ms`);
  });
});
