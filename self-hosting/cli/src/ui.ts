const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (text: string) =>
  useColor ? `\u001b[${code}m${text}\u001b[0m` : text;

export const bold = paint(1);
export const dim = paint(2);
export const red = paint(31);
export const green = paint(32);
export const yellow = paint(33);
export const cyan = paint(36);

export const SEVERITY_LABEL = {
  error: red('error'),
  warn: yellow('warn '),
  info: cyan('info '),
} as const;

export const log = (line = '') => console.log(line);
