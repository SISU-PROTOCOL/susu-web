import type { Preview } from '@storybook/react-vite';

// The application's own stylesheet, not a copy of it.
//
// It is the whole reason stories look like the app: `@import 'tailwindcss'`
// brings in the utilities every component is styled with, and the
// `--susu-surface` / `--susu-foreground` variables declared here are what
// `Card`, `Notice` and the rest sit on. A Storybook-specific stylesheet would
// drift from this the first time a token changed.
import '../src/index.css';

/**
 * Storybook renders the app's own stylesheet, and its dark mode along with it.
 *
 * There is deliberately no light/dark toolbar toggle. The app decides its
 * appearance with a `prefers-color-scheme` media query and has no class or
 * attribute to switch — `index.css` defines the surface variables inside a
 * `@media (prefers-color-scheme: dark)` block and nothing else sets them. A
 * toggle in Storybook would therefore switch a class that nothing reads, and
 * stories would render light while claiming to be dark.
 *
 * To see the dark surfaces, use the browser's render emulation (Chrome DevTools
 * → Rendering → Emulate `prefers-color-scheme`), which is what the media query
 * actually answers. That the app has no manual override is a deliberate choice
 * in `index.css`, not a gap in this config.
 *
 * The stories themselves need no providers: everything catalogued here is one of
 * the primitives in `src/components/ui.tsx`, and those deliberately know nothing
 * about money, sessions, the chain or motion. Anything that needed a provider
 * would be a screen rather than a primitive, and a screen's meaningful states
 * are its transaction outcomes — not something a prop can stage.
 */
const preview: Preview = {
  parameters: {
    // The props are the point of these stories, so the panel opens showing them
    // rather than a summary that has to be clicked.
    controls: { expanded: true },
  },
};

export default preview;
