import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../src/components/ui';

/**
 * `Button`'s props are few and each one changes what the control promises.
 *
 * `pending` and `disabled` are not decorations: `pending` disables the button so
 * a transaction cannot be submitted twice by an impatient second click, and
 * reports `aria-busy` while it does. The stories below are the states a member
 * actually meets — the label is what a member reads while deciding whether to
 * sign, so it is a real one from the app rather than "Button".
 */
const meta = {
  title: 'Primitives/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The one action a screen exists for. */
export const Primary: Story = {
  args: { children: 'Contribute 10 USDC' },
};

/** Everything alongside the primary action: cancel, go back, show details. */
export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Cancel' },
};

/**
 * An action that belongs in the flow but not at its centre — a link out to the
 * block explorer, say. It carries no border, so it reads as text until hovered.
 */
export const Ghost: Story = {
  args: { variant: 'ghost', children: 'View on the block explorer' },
};

/**
 * Used sparingly, and never for an action that can be undone. Where the label
 * ends, the promise continues: `danger` is reserved for things like signing out
 * of every device, which cannot be taken back by pressing something else.
 */
export const Danger: Story = {
  args: { variant: 'danger', children: 'Revoke all other sessions' },
};

/**
 * Mid-transaction. Both halves of the state are announced rather than only
 * shown: the button reports `aria-busy`, and the spinner beside the label is a
 * `role="status"` region labelled "Working" rather than a bare animation, which
 * would say nothing at all.
 */
export const Pending: Story = {
  args: { pending: true, children: 'Submitting…' },
};

/**
 * Blocked by something else on the screen — no wallet connected, an amount that
 * has not parsed. Distinct from `pending`: nothing is happening yet.
 */
export const Disabled: Story = {
  args: { disabled: true, children: 'Start the round' },
};
