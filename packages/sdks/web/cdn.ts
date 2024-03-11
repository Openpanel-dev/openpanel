import { OpenpanelWeb as Openpanel } from './index';

declare global {
  interface Window {
    op: {
      q?: [string, ...any[]];
      (method: string, ...args: any[]): void;
    };
  }
}

((window) => {
  if (window.op && 'q' in window.op) {
    const queue = window.op.q || [];
    const op = new Openpanel(queue.shift()[1]);
    queue.forEach((item) => {
      if (item[0] in op) {
        // @ts-expect-error
        op[item[0]](...item.slice(1));
      }
    });

    window.op = (t, ...args) => {
      // @ts-expect-error
      const fn = op[t].bind(op);
      if (typeof fn === 'function') {
        fn(...args);
      }
    };
  }
})(window);
