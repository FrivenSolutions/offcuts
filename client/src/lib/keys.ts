/** True when a key press is meant for a text field, so shortcuts must ignore it. */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

/** True for a plain key press: no Ctrl, Alt or Meta, and not in a text field. */
export function isShortcut(e: KeyboardEvent): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey && !e.defaultPrevented && !isTypingTarget(e);
}
