const parse = (connectionString: string) => {
  const match = connectionString.match(/redis:\/\/(.+?):(.+?)@(.+?):(.+)/);
  if (!match) {
    throw new Error('Invalid connection string');
  }
  return {
    host: match[3]!,
    port: Number(match[4]),
    password: match[2]!,
  } as const;
};

export const connection = parse(String(process.env.REDIS_URL));
