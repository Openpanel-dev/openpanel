const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 15_000;

export type HermesFlowTriggerResult = {
  ok: boolean;
  status: number;
  body: unknown;
  attempts: number;
};

async function postOnce(
  webhookUrl: string,
  body: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // ignore
    }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function sendHermesFlowTrigger({
  webhookUrl,
  ruleId,
  userIds,
  fcmToken,
}: {
  webhookUrl: string;
  ruleId: string;
  userIds: string[];
  fcmToken?: string;
}): Promise<HermesFlowTriggerResult> {
  const payload =
    userIds.length === 1
      ? {
          rule_id: ruleId,
          user_id: userIds[0],
          ...(fcmToken ? { fcm_token: fcmToken } : {}),
        }
      : {
          rule_id: ruleId,
          user_ids: userIds,
        };

  const body = JSON.stringify(payload);

  let lastStatus = 0;
  let lastBody: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { status, body: resBody } = await postOnce(webhookUrl, body);
      lastStatus = status;
      lastBody = resBody;

      // 2xx / 409 (dedup) are treated as success
      if (status < 400 || status === 409) {
        return { ok: true, status, body: resBody, attempts: attempt };
      }

      // 4xx (not 409) — don't retry
      if (status >= 400 && status < 500) {
        return { ok: false, status, body: resBody, attempts: attempt };
      }
    } catch (err) {
      lastStatus = 0;
      lastBody = { error: err instanceof Error ? err.message : String(err) };
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }

  return {
    ok: false,
    status: lastStatus,
    body: lastBody,
    attempts: MAX_ATTEMPTS,
  };
}
