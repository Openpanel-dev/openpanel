import bots from './bots';

export function isBot(ua: string) {
  const res = bots.find((bot) => {
    if (new RegExp(bot.regex).test(ua)) {
      return true;
    }
    return false;
  });

  if (!res) {
    return null;
  }

  return {
    name: res.name,
    type: res.category,
  };
}
