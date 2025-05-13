export function shouldIgnoreKeypress(event: KeyboardEvent) {
  const tagName = (event?.target as HTMLElement)?.tagName;
  const modifierPressed =
    event.ctrlKey || event.metaKey || event.altKey || event.keyCode === 229;
  const isTyping =
    event.isComposing || tagName === 'INPUT' || tagName === 'TEXTAREA';

  return modifierPressed || isTyping;
}
