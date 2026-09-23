import { createCallableOpenPanel } from './callable';
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

    // Support window.op('track', ...), window.op.track(...), and native
    // Function helpers such as window.op.call(...) emitted by transpilers.
    const opCallable = createCallableOpenPanel(op);

    window.op = opCallable;
    window.openpanel = op;
  }
})(window);
