const parse = (connectionString: string) => {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port),
    password: url.password,
  } as const;
};

export const connection = parse(String(process.env.REDIS_URL));
