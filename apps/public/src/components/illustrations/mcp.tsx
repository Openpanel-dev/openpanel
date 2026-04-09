'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

const toolCalls = [
  {
    name: 'get_analytics_overview',
    params: [
      { key: 'projectId', value: '"acme-corp"' },
      { key: 'startDate', value: '"2024-03-18"' },
      { key: 'endDate', value: '"2024-03-24"' },
    ],
    result: '12,847 visitors · 1,234 signups · 3.1% bounce',
  },
  {
    name: 'get_funnel',
    params: [
      { key: 'events', value: '["page_view", "signed_up"]' },
      { key: 'startDate', value: '"2024-03-18"' },
    ],
    result: '72% conversion · up from 61% prev week',
  },
];

// Response split into segments so highlights apply as text streams in
const RESPONSE = 'Last week saw 1,234 new signups — up 23% from the week before. Your signup funnel is converting at 72%, the highest rate in the past month.';

type Phase = 'user' | 'thinking' | 'tool1' | 'tool2' | 'streaming' | 'done';

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block size-1.5 rounded-full bg-white/30 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '900ms' }}
        />
      ))}
    </div>
  );
}

function ToolCard({
  tool,
  visible,
  dim,
}: {
  tool: (typeof toolCalls)[number];
  visible: boolean;
  dim: boolean;
}) {
  return (
    <div
      className="overflow-hidden transition-all duration-500 ease-out"
      style={{
        maxHeight: visible ? '120px' : '0px',
        opacity: visible ? (dim ? 0.5 : 1) : 0,
        transform: visible ? 'translateY(0)' : 'translateY(6px)',
      }}
    >
      <div className="rounded-xl border border-[#d97757]/25 bg-[#d97757]/8 px-3 py-2.5">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-[#d97757] animate-pulse" />
          <span className="font-mono font-semibold text-[#d97757] text-[9px]">
            {tool.name}
          </span>
        </div>
        <div className="col gap-0.5 font-mono text-[8.5px] text-white/35">
          {tool.params.map((p) => (
            <div key={p.key}>
              <span className="text-white/25">{p.key}: </span>
              <span className="text-white/50">{p.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 border-white/8 border-t pt-2 font-mono text-[8.5px]">
          <span className="text-white/30">↳ </span>
          <span className="text-emerald-400/80">{tool.result}</span>
        </div>
      </div>
    </div>
  );
}

function StreamingText({ text, done }: { text: string; done: boolean }) {
  // Split the full response into plain/highlighted segments for rendering
  const segments: { content: string; highlight?: 'white' | 'emerald' }[] = [
    { content: 'Last week saw ' },
    { content: '1,234 new signups', highlight: 'white' },
    { content: ' — up 23% from the week before. Your signup funnel is converting at ' },
    { content: '72%', highlight: 'emerald' },
    { content: ', the highest rate in the past month.' },
  ];

  // Walk through segments, revealing up to text.length characters
  let remaining = text.length;
  const rendered: ReactNode[] = [];

  for (const seg of segments) {
    if (remaining <= 0) break;
    const visible = seg.content.slice(0, remaining);
    remaining -= seg.content.length;

    if (seg.highlight === 'white') {
      rendered.push(
        <span key={seg.content} className={done ? 'font-semibold text-white/90' : 'text-white/70'}>
          {visible}
        </span>,
      );
    } else if (seg.highlight === 'emerald') {
      rendered.push(
        <span key={seg.content} className={done ? 'font-semibold text-emerald-400' : 'text-white/70'}>
          {visible}
        </span>,
      );
    } else {
      rendered.push(<span key={seg.content}>{visible}</span>);
    }
  }

  return (
    <p className="text-[10px] text-white/70 leading-relaxed">
      {rendered}
      {!done && (
        <span className="ml-0.5 inline-block h-3 w-px bg-white/60 animate-pulse align-middle" />
      )}
    </p>
  );
}

export function McpIllustration() {
  const [phase, setPhase] = useState<Phase>('user');
  const [charCount, setCharCount] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    let currentTimer: ReturnType<typeof setTimeout> | null = null;

    function sleep(ms: number): Promise<void> {
      return new Promise((resolve) => {
        currentTimer = setTimeout(resolve, ms);
      });
    }

    async function run() {
      while (!cancelledRef.current) {
        setPhase('user');
        setCharCount(0);

        await sleep(1000);
        if (cancelledRef.current) return;
        setPhase('thinking');

        await sleep(900);
        if (cancelledRef.current) return;
        setPhase('tool1');

        await sleep(800);
        if (cancelledRef.current) return;
        setPhase('tool2');

        await sleep(700);
        if (cancelledRef.current) return;
        setPhase('streaming');

        // Stream chars two at a time
        for (let i = 2; i <= RESPONSE.length && !cancelledRef.current; i += 2) {
          setCharCount(Math.min(i, RESPONSE.length));
          await sleep(22);
        }
        if (cancelledRef.current) return;
        setCharCount(RESPONSE.length);

        setPhase('done');
        await sleep(3500);
      }
    }

    run();

    return () => {
      cancelledRef.current = true;
      if (currentTimer) clearTimeout(currentTimer);
    };
  }, []);

  const showThinking = phase === 'thinking' || phase === 'tool1' || phase === 'tool2';
  const showTool1 = phase === 'tool1' || phase === 'tool2' || phase === 'streaming' || phase === 'done';
  const showTool2 = phase === 'tool2' || phase === 'streaming' || phase === 'done';
  const showResponse = phase === 'streaming' || phase === 'done';

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl transition-transform duration-300 group-hover:scale-[1.01]">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-white/8 border-b bg-[#161616] px-4 py-3">
        <div className="size-2.5 rounded-full bg-[#ff5f57]" />
        <div className="size-2.5 rounded-full bg-[#febc2e]" />
        <div className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="absolute right-0 left-0 flex-1 text-center font-medium text-[10px] text-white/30">
          Claude
        </span>
      </div>

      {/* Chat body */}
      <div className="col gap-3 p-4">
        {/* User message — always visible */}
        <div className="flex justify-end">
          <div className="max-w-[78%] rounded-2xl rounded-tr-md bg-[#2a2a2a] px-3.5 py-2.5">
            <p className="text-[10px] text-white/85 leading-relaxed">
              How did our signups perform last week, and what's our funnel
              conversion looking like?
            </p>
          </div>
        </div>

        {/* Claude avatar row */}
        <div className="flex items-center gap-2">
          <div className="flex size-4 shrink-0 items-center justify-center">
            <svg
              className="size-4 fill-[#d97757]"
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
            </svg>
          </div>
          <span className="font-medium text-[9px] text-white/40">Claude</span>
        </div>

        {/* Thinking dots */}
        <div
          className="transition-all duration-300"
          style={{
            maxHeight: showThinking ? '24px' : '0px',
            opacity: showThinking ? 1 : 0,
            overflow: 'hidden',
          }}
        >
          <ThinkingDots />
        </div>

        {/* Tool calls */}
        <div className="col gap-2">
          <ToolCard tool={toolCalls[0]!} visible={showTool1} dim={false} />
          <ToolCard tool={toolCalls[1]!} visible={showTool2} dim={false} />
        </div>

        {/* Streaming response */}
        <div
          className="transition-all duration-300"
          style={{
            maxHeight: showResponse ? '120px' : '0px',
            opacity: showResponse ? 1 : 0,
            overflow: 'hidden',
          }}
        >
          <StreamingText
            text={RESPONSE.slice(0, charCount)}
            done={phase === 'done'}
          />
        </div>
      </div>
    </div>
  );
}
