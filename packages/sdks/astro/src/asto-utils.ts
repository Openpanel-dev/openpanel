const BLACKLISTED_PROPS = ['class'];

export function filterProps(props: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !BLACKLISTED_PROPS.includes(key)),
  );
}
