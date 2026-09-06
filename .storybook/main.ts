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
 * Expected devDependencies:
 *
 *   pnpm add -D storybook @storybook/react-vite @storybook/addon-a11y
 *
 * They are not in `package.json` in this checkout: the registry was not
 * reachable when this was written, and a dependency list that disagrees with
 * `pnpm-lock.yaml` fails `pnpm install --frozen-lockfile` — which is the first
 * step of both CI and the Dockerfile, and a worse thing to break than a
 * Storybook that has not been started yet.
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
