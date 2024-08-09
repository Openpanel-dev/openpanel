import { OpenPanel } from './index';

((window) => {
  if (window.op && 'q' in window.op) {
    const queue = window.op.q || [];
    // @ts-expect-error
    const op = new OpenPanel(queue.shift()[1]);
    queue.forEach((item) => {
      if (item[0] in op) {
        // @ts-expect-error
        op[item[0]](...item.slice(1));
      }
    });

    window.op = (t, ...args) => {
      const fn = op[t] ? op[t].bind(op) : undefined;
      if (typeof fn === 'function') {
        // @ts-expect-error
        fn(...args);
      } else {
        console.warn(`OpenPanel: ${t} is not a function`);
      }
    };

    window.openpanel = op;
  }
})(window);
