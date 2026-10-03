export type CallableOpenPanel<T extends object> = T &
  ((method: string, ...args: any[]) => void);

export function createCallableOpenPanel<T extends object>(
  op: T
): CallableOpenPanel<T> {
  const target = ((method: string, ...args: any[]) => {
    const value = Reflect.get(op, method);
    if (typeof value === 'function') {
      value.apply(op, args);
    } else {
      console.warn(`OpenPanel: ${method} is not a function`);
    }
  }) as CallableOpenPanel<T>;

  return new Proxy(target, {
    get(target, prop, receiver) {
      if (prop === 'q') {
        return undefined;
      }

      const value = Reflect.get(op, prop);
      if (typeof value === 'function') {
        return value.bind(op);
      }
      if (value !== undefined) {
        return value;
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
