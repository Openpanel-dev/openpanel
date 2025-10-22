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

// Common legitimate browser patterns - if UA matches these, it's very likely a real browser
// This provides ultra-fast early exit for ~95% of real traffic
const legitimateBrowserPatterns = [
  'Mozilla/5.0', // Nearly all modern browsers
  'Chrome/', // Chrome/Chromium browsers
  'Safari/', // Safari and Chrome-based browsers
  'Firefox/', // Firefox
  'Edg/', // Edge
];

const mobilePatterns = ['iPhone', 'Android', 'iPad'];

const desktopOSPatterns = ['Windows NT', 'Macintosh', 'X11; Linux'];

export function isBot(ua: string) {
  // Ultra-fast early exit: check if this looks like a legitimate browser
  // Real browsers typically have Mozilla/5.0 + browser name + OS
  if (ua.includes('Mozilla/5.0')) {
    // Check for browser signature
    const hasBrowser = legitimateBrowserPatterns.some((pattern) =>
      ua.includes(pattern),
    );

    // Check for OS signature (mobile or desktop)
    const hasOS =
      mobilePatterns.some((pattern) => ua.includes(pattern)) ||
      desktopOSPatterns.some((pattern) => ua.includes(pattern));

    // If it has Mozilla/5.0, a known browser, and an OS, it's very likely legitimate
    if (hasBrowser && hasOS) {
      return null;
    }
  }

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
}
