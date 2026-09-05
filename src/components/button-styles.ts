/**
 * The classes a button wears, apart from the `Button` component.
 *
 * These live in their own module for two reasons. A file that exports both
 * components and plain functions opts out of fast refresh — the rule the linter
 * enforces above, and the same reason the auth context is kept apart from its
 * provider. And the styles are needed by two different things: the `Button`
 * component, and navigations that must look like a button but be a real anchor,
 * which is what a router `Link` renders.
 *
 * That second caller is why this is not merely tidiness. A `<button>` that calls
 * `navigate()` cannot be opened in a new tab, copied as a link, or followed
 * without JavaScript; an anchor can. Sharing the styles is what keeps the two
 * from drifting into looking like different things.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-400 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-600',
  secondary:
    'border border-neutral-300 hover:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800',
  ghost:
    'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100',
  // For actions that destroy something. The colour is the only thing separating
  // it from a primary button, which is why it is used sparingly: an action that
  // cannot be undone should not look like one that can.
  danger:
    'border border-red-300 text-red-700 hover:bg-red-50 disabled:text-red-300 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 dark:disabled:text-red-900',
};

export function buttonClasses(variant: ButtonVariant = 'primary'): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${BUTTON_STYLES[variant]}`;
}
