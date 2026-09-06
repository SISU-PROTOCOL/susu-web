import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook, configured by hand rather than by `storybook init`.
 *
 * `init` writes a starter kit — example components, an `Introduction.mdx`, its
 * own CSS reset, a set of addons this project does not use — and then asks to be
 * reconciled with the Vite setup that already exists here. There is nothing to
 * reconcile: the builder reads `vite.config.ts` as-is, which is where Tailwind v4
 * (`@tailwindcss/vite`) and the `@` alias are declared, so a story renders with
 * the app's real utilities and can import the way the app imports. What is left
 * to configure is three lines long, which is the point.
 *
 * The three packages this needs are devDependencies of the project and are
 * pinned to 10.6.0 in `pnpm-lock.yaml`:
 *
 *   storybook  @storybook/react-vite  @storybook/addon-a11y
 *
 * The major is load-bearing. Storybook 8 cannot be used here: its
 * `@storybook/builder-vite` resolves `@storybook/react/dist/entry-preview.mjs`,
 * which no longer exists in the layout Storybook 10 ships, and the build fails
 * on that import. A local checkout that still had 8.x linked in `node_modules`
 * failed `pnpm build-storybook` for exactly this reason while the lockfile
 * asked for 10.6.0 — so if this build breaks after a `storybook@8` was
 * installed by hand, run `pnpm install` to relink before debugging the config.
 *
 * `pnpm build-storybook` runs in CI for the same reason: a catalogue that is
 * never built is a catalogue that quietly stops working.
 */
const config: StorybookConfig = {
  // In `stories/` rather than beside the components, so that the app's source
  // tree stays exactly the app: `tsconfig.json` typechecks `src/`, and a
  // Storybook-only dependency reaching into it would put a catalogue tool in the
  // path of `pnpm build`. Everything under `stories/` is a catalogue entry and
  // nothing there is imported by `src/main.tsx`.
  stories: ['../stories/**/*.stories.@(ts|tsx)'],

  // The one addon, and it is here because accessibility is a stated concern of
  // this app rather than a default worth copying: `Notice` changes its ARIA role
  // with its tone, `Button` reports `aria-busy` while pending, and `Field` wires
  // its error to the input with `aria-describedby`. Those are exactly the things
  // a checker can see and a screenshot cannot.
  //
  // Controls, actions, viewport, backgrounds and toolbars are part of Storybook
  // itself as of v9; `addon-essentials` no longer exists, so there is nothing to
  // add for them.
  addons: ['@storybook/addon-a11y'],

  framework: {
    name: '@storybook/react-vite',
    options: {},
  },

  // No `viteFinal`. The builder merges the project's own Vite config, and
  // overriding it here — even to re-add the same plugins — is how the two
  // configurations drift until a story renders differently from the app.
};

export default config;
