// Cred to (@OpenStatusHQ) https://github.com/openstatusHQ/openstatus/blob/main/packages/notifications/discord/src/index.ts

export function sendDiscordNotification({
  webhookUrl,
  message,
}: {
  webhookUrl: string;
  message: string;
}) {
  return fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: message,
      avatar_url: 'https://openpanel.dev/logo.jpg',
      username: 'OpenPanel Notifications',
    }),
  }).catch((err) => {
    return {
      ok: false,
      json: () => Promise.resolve({}),
    };
  });
}

export function sendTestDiscordNotification(webhookUrl: string) {
  return sendDiscordNotification({
    webhookUrl,
    message:
      '**🧪 Test [OpenPanel.dev](<https://openpanel.dev/>)**\nIf you can read this, your Slack webhook is functioning correctly!\n',
  });
}
