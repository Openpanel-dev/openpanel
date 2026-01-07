import fs from 'node:fs';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type { PackageInfo } from './publish';

const workspacePath = (relativePath: string) =>
  resolve(__dirname, '../../', relativePath);

const dedentContent = (text: string): string => {
  const lines = text.split('\n');
  if (lines.length === 0) return text;

  // Find the minimum indentation (excluding empty lines)
  // We'll dedent code blocks too, so include them in the calculation
  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines
    if (trimmed.length === 0) continue;
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (indent < minIndent) minIndent = indent;
  }

  // If no indentation found, return as-is
  if (minIndent === Number.POSITIVE_INFINITY || minIndent === 0) return text;

  // Remove the common indentation from all lines
  return lines
    .map((line) => {
      // For lines shorter than minIndent, just return them as-is (preserves empty lines)
      if (line.length < minIndent) return line;
      // Remove the common indentation
      const dedented = line.slice(minIndent);
      // If the line was all whitespace, return empty string to preserve the line
      return line.trim().length === 0 ? '' : dedented;
    })
    .join('\n');
};

const transformMdxToReadme = (
  mdxContent: string,
  packageName: string,
): string => {
  let content = mdxContent;

  // Load MDX component content files
  const commonSdkConfigPath = workspacePath(
    'apps/public/src/components/common-sdk-config.mdx',
  );
  const webSdkConfigPath = workspacePath(
    'apps/public/src/components/web-sdk-config.mdx',
  );

  let commonSdkConfigContent = '';
  let webSdkConfigContent = '';

  try {
    if (fs.existsSync(commonSdkConfigPath)) {
      commonSdkConfigContent = fs.readFileSync(commonSdkConfigPath, 'utf-8');
    }
  } catch {
    // Ignore if file doesn't exist
  }

  try {
    if (fs.existsSync(webSdkConfigPath)) {
      webSdkConfigContent = fs.readFileSync(webSdkConfigPath, 'utf-8');
    }
  } catch {
    // Ignore if file doesn't exist
  }

  // Extract title from frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  let title = packageName;
  let description = '';

  if (frontmatterMatch?.[1]) {
    const frontmatter = frontmatterMatch[1];
    const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (titleMatch?.[1]) title = titleMatch[1].trim();
    if (descMatch?.[1]) description = descMatch[1].trim();

    // Remove frontmatter
    content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  }

  // Replace MDX component references with their actual content
  // This must happen before code block protection so component content is also protected
  if (commonSdkConfigContent) {
    content = content.replace(
      /<CommonSdkConfig\s*\/>/g,
      `\n${commonSdkConfigContent}\n`,
    );
  }
  if (webSdkConfigContent) {
    content = content.replace(
      /<WebSdkConfig\s*\/>/g,
      `\n${webSdkConfigContent}\n`,
    );
  }

  // Protect code blocks from transformation
  // Extract code blocks before any transformations to preserve their content
  const codeBlockPlaceholders: string[] = [];
  // Match code blocks: ```language (optional) followed by content until closing ```
  // Using [\s\S] to match across newlines, non-greedy to stop at first closing ```
  const codeBlockRegex = /```[\s\S]*?```/g;

  // Extract and replace code blocks with placeholders
  content = content.replace(codeBlockRegex, (match) => {
    const placeholder = `__CODE_BLOCK_${codeBlockPlaceholders.length}__`;
    codeBlockPlaceholders.push(match);
    return placeholder;
  });

  // Remove import statements (outside code blocks)
  content = content.replace(/^import\s+.*$/gm, '');

  // Handle Tabs component specially - convert to markdown sections
  // Extract tabs items from items prop
  const tabsItemsMatch = content.match(/<Tabs\s+items=\{([^\}]+)\}>/);
  const tabsItems = tabsItemsMatch?.[1]
    ? tabsItemsMatch[1]
        .replace(/['"]/g, '')
        .split(',')
        .map((item) => item.trim())
    : [];

  // Replace Tabs/Tab structure with markdown sections
  if (tabsItems.length > 0) {
    // Match each Tab and convert to a markdown section
    content = content.replace(
      /<Tab\s+value="([^"]+)">([\s\S]*?)<\/Tab>/g,
      (match, value, tabContent) => {
        const dedented = dedentContent(tabContent).trim();
        return `\n#### ${value}\n\n${dedented}\n\n`;
      },
    );
    // Remove the Tabs wrapper
    content = content.replace(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, '$1');
  } else {
    // Fallback: if no items prop, just convert tabs to sections
    content = content.replace(
      /<Tab\s+value="([^"]+)">([\s\S]*?)<\/Tab>/g,
      (match, value, tabContent) => {
        const dedented = dedentContent(tabContent).trim();
        return `\n#### ${value}\n\n${dedented}\n\n`;
      },
    );
    content = content.replace(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, '$1');
  }

  // Remove self-closing JSX components (like <CommonSdkConfig />, <WebSdkConfig />)
  content = content.replace(/<[A-Z][a-zA-Z]*[^>]*\/>/g, '');

  // Remove JSX component tags but preserve content between opening/closing tags
  // Handle nested components by recursively removing outer tags
  // This regex matches opening tag, captures content (including nested tags), and closing tag
  let previousContent = '';
  while (content !== previousContent) {
    previousContent = content;
    // Match JSX components with their content - handles one level of nesting
    content = content.replace(
      /<([A-Z][a-zA-Z]*)[^>]*>([\s\S]*?)<\/\1>/g,
      (match, tagName, innerContent) => {
        return dedentContent(innerContent).trim();
      },
    );
  }

  // Remove any remaining JSX tags (self-closing or unmatched)
  content = content.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  // Restore code blocks
  codeBlockPlaceholders.forEach((codeBlock, index) => {
    content = content.replace(`__CODE_BLOCK_${index}__`, codeBlock);
  });

  // Convert internal links (starting with /) to absolute URLs
  content = content.replace(
    /\[([^\]]+)\]\((\/[^\)]+)\)/g,
    '[$1](https://openpanel.dev$2)',
  );

  // Clean up extra blank lines
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  // Build the README header
  const docUrl = `https://openpanel.dev/docs/sdks/${packageName.replace('@openpanel/', '')}`;
  let readme = `# ${title}\n\n`;

  if (description) {
    readme += `${description}\n\n`;
  }

  readme += `> 📖 **Full documentation:** [${docUrl}](${docUrl})\n\n`;
  readme += '---\n\n';
  readme += content;

  return readme;
};

export const generateReadme = (
  packages: Record<string, PackageInfo>,
  dependents: string[],
): string[] => {
  const generatedReadmes: string[] = [];
  for (const dep of dependents) {
    const pkg = packages[dep];
    const docPath = pkg?.config?.docPath;
    if (!docPath) {
      console.log(
        `📝 Skipping README generation for ${dep} (no docPath configured)`,
      );
      continue;
    }

    const packagePath = workspacePath(pkg.localPath);
    const readmePath = join(packagePath, 'README.md');
    console.log(`📝 Generating README for ${dep}`);
    const mdxContent = fs.readFileSync(workspacePath(docPath), 'utf-8');
    const readmeContent = transformMdxToReadme(mdxContent, pkg.name);
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
    generatedReadmes.push(readmePath);
  }
  return generatedReadmes;
};
