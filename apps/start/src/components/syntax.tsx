import { CopyIcon } from 'lucide-react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/cjs/languages/hljs/bash';
import json from 'react-syntax-highlighter/dist/cjs/languages/hljs/json';
import markdown from 'react-syntax-highlighter/dist/cjs/languages/hljs/markdown';
import ts from 'react-syntax-highlighter/dist/cjs/languages/hljs/typescript';
import docco from 'react-syntax-highlighter/dist/cjs/styles/hljs/vs2015';
import { clipboard } from '@/utils/clipboard';
import { cn } from '@/utils/cn';

SyntaxHighlighter.registerLanguage('typescript', ts);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('markdown', markdown);

interface SyntaxProps {
  code: string;
  className?: string;
  language?: 'typescript' | 'bash' | 'json' | 'markdown';
  wrapLines?: boolean;
  copyable?: boolean;
}

export default function Syntax({
  code,
  className,
  language = 'typescript',
  wrapLines = false,
  copyable = true,
}: SyntaxProps) {
  return (
    <div className={cn('group relative rounded-lg', className)}>
      {copyable && (
        <button
          className="row absolute top-1 right-1 items-center gap-2 rounded bg-card p-2 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => {
            clipboard(code, null);
          }}
          type="button"
        >
          <span>Copy</span>
          <CopyIcon size={12} />
        </button>
      )}
      <SyntaxHighlighter
        customStyle={{
          borderRadius: 'var(--radius)',
          padding: '1rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          fontSize: 14,
          lineHeight: 1.3,
        }}
        language={language}
        style={docco}
        wrapLongLines={wrapLines}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
