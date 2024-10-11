export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.HYPERDX_API_KEY) {
    const { initSDK } = await import('@hyperdx/node-opentelemetry');
    initSDK({
      consoleCapture: true,
      apiKey: process.env.HYPERDX_API_KEY,
      service: 'dashboard',
    });
  }
}
