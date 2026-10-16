// A .env model that round-trips: comments, blank lines and ordering survive
// edits, so `doctor --fix` never rewrites a file the user has annotated.
const ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

const unquote = (raw: string): string => {
  const isQuoted =
    raw.length >= 2 &&
    (raw.startsWith('"') || raw.startsWith("'")) &&
    raw.endsWith(raw[0] as string);
  return isQuoted ? raw.slice(1, -1) : raw;
};

export class EnvFile {
  private readonly lines: string[];

  constructor(text = '') {
    this.lines = text.length === 0 ? [] : text.replace(/\n$/, '').split('\n');
  }

  private indexOf(key: string): number {
    return this.lines.findIndex((line) => ASSIGNMENT.exec(line)?.[1] === key);
  }

  has(key: string): boolean {
    return this.indexOf(key) !== -1;
  }

  // A blank `KEY=` counts as unset, matching how the api reads its env.
  get(key: string): string | undefined {
    const index = this.indexOf(key);
    if (index === -1) {
      return undefined;
    }
    const value = unquote(
      ASSIGNMENT.exec(this.lines[index] as string)?.[2] ?? ''
    );
    return value === '' ? undefined : value;
  }

  set(key: string, value: string): void {
    const line = `${key}="${value}"`;
    const index = this.indexOf(key);
    if (index === -1) {
      this.lines.push(line);
      return;
    }
    this.lines[index] = line;
  }

  remove(key: string): void {
    const index = this.indexOf(key);
    if (index !== -1) {
      this.lines.splice(index, 1);
    }
  }

  toString(): string {
    return `${this.lines.join('\n')}\n`;
  }
}
