import { cacheable } from '@openpanel/redis';
import bots from './bots';

// Pre-compile regex patterns at module load time
const compiledBots = bots.map((bot) => {
  if ('regex' in bot) {
    return {
      ...bot,
      compiledRegex: new RegExp(bot.regex),
    };
  }
  return bot;
});

const regexBots = compiledBots.filter((bot) => 'compiledRegex' in bot);
const includesBots = compiledBots.filter((bot) => 'includes' in bot);

export const isBot = cacheable(
  'is-bot',
  (ua: string) => {
    // Check simple string patterns first (fast)
    for (const bot of includesBots) {
      if (ua.includes(bot.includes)) {
        return {
          name: bot.name,
          type: 'category' in bot ? bot.category : 'Unknown',
        };
      }
    }

    // Check regex patterns (slower)
    for (const bot of regexBots) {
      if (bot.compiledRegex.test(ua)) {
        return {
          name: bot.name,
          type: 'category' in bot ? bot.category : 'Unknown',
        };
      }
    }

    return null;
  },
  60 * 60, // 1 hour
  'lru',
);
