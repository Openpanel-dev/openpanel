import { memo } from 'react';
import ReactMarkdown, { type Options } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkHighlight from 'remark-highlight';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import 'katex/dist/katex.min.css';

export const Markdown = memo<Options>(
  (props) => (
    <ReactMarkdown
      {...props}
      remarkPlugins={[remarkParse, remarkHighlight, remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex, remarkRehype]}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    'className' in prevProps &&
    'className' in nextProps &&
    prevProps.className === nextProps.className,
);

Markdown.displayName = 'Markdown';
