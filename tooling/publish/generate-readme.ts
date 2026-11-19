import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type { PackageInfo } from './publish';

const workspacePath = (relativePath: string) =>
  resolve(__dirname, '../../', relativePath);

const dedentContent = (text: string): string => {
  const lines = text.split('\n');
  if (lines.length === 0) {
    return text;
  }

  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (indent < minIndent) {
      minIndent = indent;
    }
  }

  if (minIndent === Number.POSITIVE_INFINITY || minIndent === 0) {
    return text;
  }

  return lines
    .map((line) => {
      if (line.length < minIndent) {
        return line;
      }
      const dedented = line.slice(minIndent);
      return line.trim().length === 0 ? '' : dedented;
    })
    .join('\n');
};

const transformMdxToReadme = (
  mdxContent: string,
  packageName: string
): string => {
  let content = mdxContent;

  const commonSdkConfigPath = workspacePath(
    'apps/public/src/components/common-sdk-config.mdx'
  );
  const webSdkConfigPath = workspacePath(
    'apps/public/src/components/web-sdk-config.mdx'
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

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  let title = packageName;
  let description = '';

  if (frontmatterMatch?.[1]) {
    const frontmatter = frontmatterMatch[1];
    const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (titleMatch?.[1]) {
      title = titleMatch[1].trim();
    }
    if (descMatch?.[1]) {
      description = descMatch[1].trim();
    }

    content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  }

  // Must run before code-block protection below, so injected component
  // content is protected too.
  if (commonSdkConfigContent) {
    content = content.replace(
      /<CommonSdkConfig\s*\/>/g,
      `\n${commonSdkConfigContent}\n`
    );
  }
  if (webSdkConfigContent) {
    content = content.replace(
      /<WebSdkConfig\s*\/>/g,
      `\n${webSdkConfigContent}\n`
    );
  }

  const codeBlockPlaceholders: string[] = [];
  const codeBlockRegex = /```[\s\S]*?```/g;

  content = content.replace(codeBlockRegex, (match) => {
    const placeholder = `__CODE_BLOCK_${codeBlockPlaceholders.length}__`;
    codeBlockPlaceholders.push(match);
    return placeholder;
  });

  content = content.replace(/^import\s+.*$/gm, '');

  const tabsItemsMatch = content.match(/<Tabs\s+items=\{([^}]+)\}>/);
  const tabsItems = tabsItemsMatch?.[1]
    ? tabsItemsMatch[1]
        .replace(/['"]/g, '')
        .split(',')
        .map((item) => item.trim())
    : [];

  if (tabsItems.length > 0) {
    content = content.replace(
      /<Tab\s+value="([^"]+)">([\s\S]*?)<\/Tab>/g,
      (match, value, tabContent) => {
        const dedented = dedentContent(tabContent).trim();
        return `\n#### ${value}\n\n${dedented}\n\n`;
      }
    );
    content = content.replace(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, '$1');
  } else {
    content = content.replace(
      /<Tab\s+value="([^"]+)">([\s\S]*?)<\/Tab>/g,
      (match, value, tabContent) => {
        const dedented = dedentContent(tabContent).trim();
        return `\n#### ${value}\n\n${dedented}\n\n`;
      }
    );
    content = content.replace(/<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g, '$1');
  }

  content = content.replace(/<[A-Z][a-zA-Z]*[^>]*\/>/g, '');

  let previousContent = '';
  while (content !== previousContent) {
    previousContent = content;
    content = content.replace(
      /<([A-Z][a-zA-Z]*)[^>]*>([\s\S]*?)<\/\1>/g,
      (match, tagName, innerContent) => {
        return dedentContent(innerContent).trim();
      }
    );
  }

  content = content.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  codeBlockPlaceholders.forEach((codeBlock, index) => {
    content = content.replace(`__CODE_BLOCK_${index}__`, codeBlock);
  });

  content = content.replace(
    /\[([^\]]+)\]\((\/[^)]+)\)/g,
    '[$1](https://openpanel.dev$2)'
  );

  content = content.replace(/\n{3,}/g, '\n\n').trim();

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
  dependents: string[]
): string[] => {
  const generatedReadmes: string[] = [];
  for (const dep of dependents) {
    const pkg = packages[dep];
    const docPath = pkg?.config?.docPath;
    if (!docPath) {
      console.log(
        `📝 Skipping README generation for ${dep} (no docPath configured)`
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
