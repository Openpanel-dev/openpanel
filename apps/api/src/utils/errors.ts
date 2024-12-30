export class LogError extends Error {
  public readonly payload?: Record<string, unknown>;

  constructor(
    message: string,
    payload?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LogError';
    this.payload = payload;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
