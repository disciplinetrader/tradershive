/**
 * Single source of truth for "the user is typing right now".
 *
 * Every global keyboard layer (chart drawings, trading shortcuts, workspace
 * shortcuts) must consult this before acting, otherwise typing a label can
 * delete the selected drawing, fire an order shortcut or toggle a panel.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el !== "object") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Radix and other overlay primitives host focus inside a dialog/listbox
  // where chart shortcuts should also stay quiet.
  return typeof el.closest === "function" && !!el.closest('[data-typing-surface="true"]');
}
