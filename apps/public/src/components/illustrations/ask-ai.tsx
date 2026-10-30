import { SparklesIcon } from 'lucide-react';
import { Bar, IllustrationPanel } from './shared';

export function AskAiIllustration() {
  return (
    <IllustrationPanel>
      <div className="col w-full max-w-md gap-4">
        <div className="self-end rounded-2xl rounded-br-md bg-foreground px-4 py-3 text-background text-sm leading-relaxed">
          Which referrer brought the most sign-ups last week?
        </div>
        <div className="col gap-3 self-start rounded-2xl rounded-bl-md border bg-background p-4 text-sm leading-relaxed shadow-black/5 shadow-xl">
          <p>
            Product Hunt, with <strong>312 sign-ups</strong>. Google was second
            and X third. Product Hunt also converted best, at 9.4%.
          </p>
          <div className="col gap-1">
            <Bar label="producthunt.com" share={100} value="312" />
            <Bar label="google.com" share={63} value="198" />
            <Bar label="x.com" share={27} value="84" />
          </div>
          <p className="row items-center gap-1.5 text-muted-foreground">
            <SparklesIcon className="size-3.5" />
            Answered by your AI, with OpenPanel data
          </p>
        </div>
      </div>
    </IllustrationPanel>
  );
}
