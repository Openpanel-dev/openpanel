interface ConstantsLike {
  getWebViewUserAgentAsync: () => Promise<string | null>;
}

/** Narrow Expo export objects to those with a callable User-Agent helper. */
function hasUserAgentHelper(value: unknown): value is ConstantsLike {
  return (
    value !== null &&
    typeof value === 'object' &&
    'getWebViewUserAgentAsync' in value &&
    typeof value.getWebViewUserAgentAsync === 'function'
  );
}

/** Resolve either Expo export shape and omit the optional header on failure. */
export async function getWebViewUserAgent(
  module: unknown
): Promise<string | null> {
  try {
    const defaultExport =
      module !== null && typeof module === 'object' && 'default' in module
        ? module.default
        : null;
    const constants = hasUserAgentHelper(defaultExport)
      ? defaultExport
      : module;
    if (!hasUserAgentHelper(constants)) {
      return null;
    }
    return await constants.getWebViewUserAgentAsync();
  } catch {
    // Native User-Agent support varies by Expo runtime; tracking can omit it.
    return null;
  }
}
