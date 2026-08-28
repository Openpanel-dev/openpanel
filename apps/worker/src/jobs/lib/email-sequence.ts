import { type EmailData, type EmailTemplate, sendEmail } from '@openpanel/email';
import { differenceInDays } from 'date-fns';

/**
 * A day-gated email sequence runner, shared by the onboarding drip and the
 * wind-down track.
 *
 * Each subject carries a pointer (the last step whose email was sent) and an
 * anchor date. On every tick the runner resolves the next step, checks the day
 * gate and the step's own guard, sends, then advances the pointer.
 *
 * Three deliberate differences from the original inline implementation in
 * cron.onboarding.ts, all of which matter once a sequence ends in deletion:
 *
 * 1. The pointer resolves by step name and an *unknown* name completes the
 *    sequence rather than restarting it. The old `findIndex` returned -1 for a
 *    renamed or removed step, which silently sent the subject back to step 0.
 * 2. `'skip'` advances past a step; `false` only defers it. The old code had
 *    one value for both, so a step that should be passed over stalled the
 *    sequence permanently.
 * 3. `requireDelivery` refuses to advance unless the email actually went out.
 *    `sendEmail` returns null instead of throwing when a send is suppressed or
 *    misconfigured, so a step with side effects could otherwise fire on an
 *    email nobody received.
 */

/**
 * - `true`       send it now
 * - `false`      not yet — leave the pointer put and reconsider next tick
 * - `'skip'`     doesn't apply to this subject — advance without sending
 * - `'complete'` the sequence is finished for this subject
 */
export type StepResult = boolean | 'skip' | 'complete';

export interface SequenceStep<TCtx, T extends EmailTemplate = EmailTemplate> {
  /** Whole days since the anchor before this step may fire. */
  day: number;
  /**
   * Stable identifier persisted as the pointer. Renaming one is a data
   * migration, not a refactor — see the unknown-pointer rule above.
   */
  step: string;
  template: T;
  /**
   * Only advance the pointer if the send is confirmed. Use for any step whose
   * `onSent` has consequences the subject was promised an email about.
   */
  requireDelivery?: boolean;
  shouldSend?: (ctx: TCtx) => Promise<StepResult>;
  data: (ctx: TCtx) => EmailData<T> | Promise<EmailData<T>>;
  /** Applied after a confirmed send, before the pointer advances. */
  onSent?: (ctx: TCtx) => Promise<void>;
};

/** Keeps `template` and `data` correlated; TS can't infer that from the array. */
export function step<TCtx, T extends EmailTemplate>(
  config: SequenceStep<TCtx, T>,
): SequenceStep<TCtx, EmailTemplate> {
  return config as SequenceStep<TCtx, EmailTemplate>;
}

export interface SequenceSubject<TCtx> {
  /** For logging only. */
  id: string;
  /** Recipient address. */
  email: string;
  /** Day gates are measured from here. */
  anchor: Date;
  /** Last sent step, or null if the sequence hasn't started. */
  pointer: string | null;
  ctx: TCtx;
};

export interface SequenceResult {
  emailsSent: number;
  completed: number;
  /** Subjects left where they were (day gate or a `false` guard). */
  deferred: number;
  /** Steps advanced past without sending. */
  stepsSkipped: number;
  /** Sends that threw, or that `requireDelivery` rejected. */
  failed: number;
};

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

export interface RunSequenceOptions<TCtx> {
  /** Sequence name, for log lines. */
  name: string;
  steps: SequenceStep<TCtx, EmailTemplate>[];
  subjects: SequenceSubject<TCtx>[];
  /** Persist the pointer after a send or a skip. */
  onAdvance: (subject: SequenceSubject<TCtx>, step: string) => Promise<void>;
  /**
   * No steps remain, or a guard returned 'complete'. Omit it when the final
   * pointer must be preserved because something else reads it — a wind-down
   * org at 'final_warning' is still blocked from ingesting, so overwriting
   * that pointer with a completion sentinel would quietly unblock it.
   */
  onComplete?: (subject: SequenceSubject<TCtx>) => Promise<void>;
  logger: Logger;
};

export async function runSequence<TCtx>({
  name,
  steps,
  subjects,
  onAdvance,
  onComplete,
  logger,
}: RunSequenceOptions<TCtx>): Promise<SequenceResult> {
  const result: SequenceResult = {
    emailsSent: 0,
    completed: 0,
    deferred: 0,
    stepsSkipped: 0,
    failed: 0,
  };
  const now = new Date();

  for (const subject of subjects) {
    const startIndex = resolveIndex(steps, subject.pointer);

    if (startIndex === 'unknown') {
      // A step that no longer exists. Completing is the safe reading — the
      // alternative is replaying the sequence from the top.
      logger.warn(
        { sequence: name, subject: subject.id, pointer: subject.pointer },
        'Unknown sequence pointer, marking complete',
      );
      await onComplete?.(subject);
      result.completed++;
      continue;
    }

    // One tick can cross several steps when guards skip, but never more than
    // the sequence length.
    let index = startIndex + 1;

    while (index < steps.length) {
      const current = steps[index];
      if (!current) {
        break;
      }

      if (differenceInDays(now, subject.anchor) < current.day) {
        result.deferred++;
        break;
      }

      const guard = current.shouldSend
        ? await current.shouldSend(subject.ctx)
        : true;

      if (guard === 'complete') {
        await onComplete?.(subject);
        result.completed++;
        break;
      }

      if (guard === false) {
        result.deferred++;
        break;
      }

      if (guard === 'skip') {
        await onAdvance(subject, current.step);
        result.stepsSkipped++;
        index++;
        continue;
      }

      const sent = await sendStep({
        sequence: name,
        subject,
        step: current,
        logger,
      });

      if (!sent) {
        result.failed++;
        break;
      }

      await current.onSent?.(subject.ctx);
      await onAdvance(subject, current.step);
      result.emailsSent++;
      break;
    }

    if (index >= steps.length) {
      await onComplete?.(subject);
      result.completed++;
    }
  }

  logger.info({ sequence: name, ...result }, `Sequence ${name} tick`);

  return result;
}

function resolveIndex<TCtx>(
  steps: SequenceStep<TCtx, EmailTemplate>[],
  pointer: string | null,
): number | 'unknown' {
  if (!pointer) {
    return -1;
  }
  const index = steps.findIndex((entry) => entry.step === pointer);
  return index === -1 ? 'unknown' : index;
}

async function sendStep<TCtx>({
  sequence,
  subject,
  step: current,
  logger,
}: {
  sequence: string;
  subject: SequenceSubject<TCtx>;
  step: SequenceStep<TCtx, EmailTemplate>;
  logger: Logger;
}): Promise<boolean> {
  try {
    const data = await current.data(subject.ctx);

    const delivery = await sendEmail(current.template, {
      to: subject.email,
      data: data as never,
    });

    // A null return means suppressed, unparseable, or no provider configured —
    // note that a local environment without RESEND_API_KEY/SMTP_HOST always
    // lands here, so requireDelivery steps won't advance in dev.
    if (current.requireDelivery && delivery === null) {
      logger.error(
        {
          sequence,
          subject: subject.id,
          step: current.step,
          template: current.template,
        },
        'Sequence email required delivery but was not sent, holding pointer',
      );
      return false;
    }

    return true;
  } catch (error) {
    logger.error(
      { err: error, sequence, subject: subject.id, step: current.step },
      'Failed to send sequence email',
    );
    return false;
  }
}
