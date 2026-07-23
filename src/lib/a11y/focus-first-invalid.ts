/**
 * Move keyboard focus to the first invalid form control after a failed submit.
 * Works with any element carrying `aria-invalid="true"` — shadcn's <FormControl>
 * already sets this via react-hook-form, so this hook covers those forms
 * automatically. Also supports native :invalid.
 *
 * Usage with react-hook-form:
 *   const focusFirstInvalid = useFocusFirstInvalid();
 *   form.handleSubmit(onValid, () => focusFirstInvalid(formRef.current))(e);
 */
export function focusFirstInvalid(root: HTMLElement | null | undefined): boolean {
  if (!root) return false;
  const selectors = [
    '[aria-invalid="true"]',
    "input:invalid",
    "select:invalid",
    "textarea:invalid",
  ].join(",");
  const el = root.querySelector<HTMLElement>(selectors);
  if (!el) return false;
  // Prefer focusing the actual control if the wrapper is not focusable.
  const target =
    el.tabIndex >= 0 || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(el.tagName)
      ? el
      : el.querySelector<HTMLElement>("input,select,textarea,button,[tabindex]") ?? el;
  try {
    target.focus({ preventScroll: false });
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    target.focus();
  }
  return true;
}

export function useFocusFirstInvalid() {
  return focusFirstInvalid;
}
