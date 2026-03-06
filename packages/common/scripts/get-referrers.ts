import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// extras
const extraReferrers = {
  'zoom.us': { type: 'social', name: 'Zoom' },
  'apple.com': { type: 'tech', name: 'Apple' },
  'adobe.com': { type: 'tech', name: 'Adobe' },
  'figma.com': { type: 'tech', name: 'Figma' },
  'wix.com': { type: 'commerce', name: 'Wix' },
  'gmail.com': { type: 'email', name: 'Gmail' },
  'notion.so': { type: 'tech', name: 'Notion' },
  'ebay.com': { type: 'commerce', name: 'eBay' },
  'github.com': { type: 'tech', name: 'GitHub' },
  'gitlab.com': { type: 'tech', name: 'GitLab' },
  'slack.com': { type: 'social', name: 'Slack' },
  'etsy.com': { type: 'commerce', name: 'Etsy' },
  'bsky.app': { type: 'social', name: 'Bluesky' },
  'twitch.tv': { type: 'content', name: 'Twitch' },
  'dropbox.com': { type: 'tech', name: 'Dropbox' },
  'outlook.com': { type: 'email', name: 'Outlook' },
  'medium.com': { type: 'content', name: 'Medium' },
  'paypal.com': { type: 'commerce', name: 'PayPal' },
  'discord.com': { type: 'social', name: 'Discord' },
  'stripe.com': { type: 'commerce', name: 'Stripe' },
  'spotify.com': { type: 'content', name: 'Spotify' },
  'netflix.com': { type: 'content', name: 'Netflix' },
  'whatsapp.com': { type: 'social', name: 'WhatsApp' },
  'shopify.com': { type: 'commerce', name: 'Shopify' },
  'microsoft.com': { type: 'tech', name: 'Microsoft' },
  'alibaba.com': { type: 'commerce', name: 'Alibaba' },
  'telegram.org': { type: 'social', name: 'Telegram' },
  'substack.com': { type: 'content', name: 'Substack' },
  'salesforce.com': { type: 'tech', name: 'Salesforce' },
  'instagram.com': { type: 'social', name: 'Instagram' },
  'wikipedia.org': { type: 'content', name: 'Wikipedia' },
  'mastodon.social': { type: 'social', name: 'Mastodon' },
  'office.com': { type: 'tech', name: 'Microsoft Office' },
  'squarespace.com': { type: 'commerce', name: 'Squarespace' },
  'stackoverflow.com': { type: 'tech', name: 'Stack Overflow' },
  'teams.microsoft.com': { type: 'social', name: 'Microsoft Teams' },
  'chat.com': { type: 'ai', name: 'Chat.com' },
  'chatgpt.com': { type: 'ai', name: 'ChatGPT' },
  'openai.com': { type: 'ai', name: 'OpenAI' },
  'anthropic.com': { type: 'ai', name: 'Anthropic' },
  'claude.ai': { type: 'ai', name: 'Claude' },
  'gemini.google.com': { type: 'ai', name: 'Google Gemini' },
  'bard.google.com': { type: 'ai', name: 'Google Bard' },
  'copilot.microsoft.com': { type: 'ai', name: 'Microsoft Copilot' },
  'copilot.cloud.microsoft': { type: 'ai', name: 'Microsoft Copilot' },
  'perplexity.ai': { type: 'ai', name: 'Perplexity' },
  'you.com': { type: 'ai', name: 'You.com' },
  'poe.com': { type: 'ai', name: 'Poe' },
  'phind.com': { type: 'ai', name: 'Phind' },
  'huggingface.co': { type: 'ai', name: 'Hugging Face' },
  'hf.co': { type: 'ai', name: 'Hugging Face' },
  'character.ai': { type: 'ai', name: 'Character.AI' },
  'meta.ai': { type: 'ai', name: 'Meta AI' },
  'mistral.ai': { type: 'ai', name: 'Mistral' },
  'chat.mistral.ai': { type: 'ai', name: 'Mistral Le Chat' },
  'deepseek.com': { type: 'ai', name: 'DeepSeek' },
  'chat.deepseek.com': { type: 'ai', name: 'DeepSeek Chat' },
  'pi.ai': { type: 'ai', name: 'Pi' },
  'inflection.ai': { type: 'ai', name: 'Inflection' },
  'cohere.com': { type: 'ai', name: 'Cohere' },
  'coral.cohere.com': { type: 'ai', name: 'Cohere Coral' },
  'jasper.ai': { type: 'ai', name: 'Jasper' },
  'writesonic.com': { type: 'ai', name: 'Writesonic' },
  'copy.ai': { type: 'ai', name: 'Copy.ai' },
  'rytr.me': { type: 'ai', name: 'Rytr' },
  'notion.ai': { type: 'ai', name: 'Notion AI' },
  'grammarly.com': { type: 'ai', name: 'Grammarly' },
  'grok.com': { type: 'ai', name: 'Grok' },
  'x.ai': { type: 'ai', name: 'xAI' },
  'aistudio.google.com': { type: 'ai', name: 'Google AI Studio' },
  'labs.google.com': { type: 'ai', name: 'Google Labs' },
  'ai.google': { type: 'ai', name: 'Google AI' },
  'forefront.ai': { type: 'ai', name: 'Forefront' },
  'together.ai': { type: 'ai', name: 'Together AI' },
  'groq.com': { type: 'ai', name: 'Groq' },
  'replicate.com': { type: 'ai', name: 'Replicate' },
  'vercel.ai': { type: 'ai', name: 'Vercel AI' },
  'v0.dev': { type: 'ai', name: 'v0' },
  'bolt.new': { type: 'ai', name: 'Bolt' },
  'replit.com': { type: 'ai', name: 'Replit' },
  'cursor.com': { type: 'ai', name: 'Cursor' },
  'tabnine.com': { type: 'ai', name: 'Tabnine' },
  'codeium.com': { type: 'ai', name: 'Codeium' },
  'sourcegraph.com': { type: 'ai', name: 'Sourcegraph Cody' },
  'kimi.moonshot.cn': { type: 'ai', name: 'Kimi' },
  'moonshot.ai': { type: 'ai', name: 'Moonshot AI' },
  'doubao.com': { type: 'ai', name: 'Doubao' },
  'tongyi.aliyun.com': { type: 'ai', name: 'Tongyi Qianwen' },
  'yiyan.baidu.com': { type: 'ai', name: 'Ernie Bot' },
  'chatglm.cn': { type: 'ai', name: 'ChatGLM' },
  'zhipu.ai': { type: 'ai', name: 'Zhipu AI' },
  'minimax.chat': { type: 'ai', name: 'MiniMax' },
  'lmsys.org': { type: 'ai', name: 'LMSYS' },
  'chat.lmsys.org': { type: 'ai', name: 'LMSYS Chat' },
  'llama.meta.com': { type: 'ai', name: 'Meta Llama' },
};

function transform(data: any) {
  const obj: Record<string, unknown> = {};
  for (const type in data) {
    for (const name in data[type]) {
      const domains = data[type][name].domains ?? [];
      for (const domain of domains) {
        obj[domain] = {
          type,
          name,
        };
      }
    }
  }

  return obj;
}

async function main() {
  // Get document, or throw exception on error
  try {
    const data = await fetch(
      'https://s3-eu-west-1.amazonaws.com/snowplow-hosted-assets/third-party/referer-parser/referers-latest.json'
    ).then((res) => res.json());

    fs.writeFileSync(
      path.resolve(__dirname, '../../worker/src/referrers/index.ts'),
      [
        '// This file is generated by the script get-referrers.ts',
        '',
        '// The data is fetch from snowplow-referer-parser https://github.com/snowplow-referer-parser/referer-parser',
        `// The orginal referers.yml is based on Piwik's SearchEngines.php and Socials.php, copyright 2012 Matthieu Aubry and available under the GNU General Public License v3.`,
        '',
        `const referrers: Record<string, { type: string, name: string }> = ${JSON.stringify(
          {
            ...transform(data),
            ...extraReferrers,
          }
        )} as const;`,
        'export default referrers;',
      ].join('\n'),
      'utf-8'
    );
  } catch (e) {
    console.log(e);
  }
}

main();
