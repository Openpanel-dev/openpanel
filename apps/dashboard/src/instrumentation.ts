/* eslint-disable */

export async function register() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    const { BaselimeSDK, VercelPlugin, BetterHttpInstrumentation } =
      // @ts-expect-error
      await import('@baselime/node-opentelemetry');

    const sdk = new BaselimeSDK({
      serverless: true,
      service: 'vercel-coderaxs-projects-d46dc62b',
      instrumentations: [
        new BetterHttpInstrumentation({
          plugins: [new VercelPlugin()],
        }),
      ],
    });

    sdk.start();
  }
}
