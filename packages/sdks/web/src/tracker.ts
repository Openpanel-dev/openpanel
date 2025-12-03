import { OpenPanel } from './index';

((window) => {
  if (window.op) {
    const queue = window.op.q || [];
    // @ts-expect-error
    const op = new OpenPanel(queue.shift()[1]);
    queue.forEach((item) => {
      if (item[0] in op) {
        // @ts-expect-error
        op[item[0]](...item.slice(1));
      }
    });

    // Create a Proxy that supports both window.op('track', ...) and window.op.track(...)
    const opCallable = new Proxy(
      ((method: string, ...args: any[]) => {
        const fn = (op as any)[method]
          ? (op as any)[method].bind(op)
          : undefined;
        if (typeof fn === 'function') {
          fn(...args);
        } else {
          console.warn(`OpenPanel: ${method} is not a function`);
        }
      }) as typeof op & ((method: string, ...args: any[]) => void),
      {
        get(target, prop) {
          // Handle special properties
          if (prop === 'q') {
            return undefined; // q doesn't exist after SDK loads
          }
          // If accessing a method on op, return the bound method
          const value = (op as any)[prop];
          if (typeof value === 'function') {
            return value.bind(op);
          }
          // Otherwise return the property from op (for things like options, etc.)
          return value;
        },
      },
    );

    window.op = opCallable;
    window.openpanel = op;
  }
})(window);
