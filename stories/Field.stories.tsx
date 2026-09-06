import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from '../src/components/ui';

/**
 * `Field` is the only control in the app that has to carry a mistake as well as
 * a value, and it does so with attributes rather than colour: `aria-invalid` on
 * the input, and the message wired to it with `aria-describedby`. A red border
 * on its own tells a screen reader nothing, which is why the error is a prop
 * with an id rather than a class.
 *
 * The labels, hints and messages below are the ones the create-group screen
 * passes, taken from `src/lib/susu/amounts.ts` (`amountErrorMessage`) and
 * `src/pages/app/CreateGroup.tsx`. Written out rather than imported so the
 * controls panel shows the string being rendered, which is the thing under
 * review.
 */
const meta = {
  title: 'Primitives/Field',
  component: Field,
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The smallest a field gets: a label, and an input. */
export const Default: Story = {
  args: { label: 'Number of members', name: 'capacity' },
};

/**
 * A hint is not an error and is never replaced by one — it stays put, because it
 * says what the field wants and an error says what it got.
 */
export const WithHint: Story = {
  args: {
    label: 'Contribution amount (USDC)',
    name: 'amount',
    inputMode: 'decimal',
    hint: 'Every member contributes exactly this much each round. USDC supports up to 7 decimal places.',
  },
};

/**
 * The message for a value that is a number but not an amount this protocol can
 * carry — `parseUsdc` refuses to truncate, so seven decimal places is a limit
 * that produces an error rather than a silently altered figure.
 */
export const WithError: Story = {
  args: {
    label: 'Contribution amount (USDC)',
    name: 'amount',
    inputMode: 'decimal',
    defaultValue: '10.123456789',
    hint: 'Every member contributes exactly this much each round. USDC supports up to 7 decimal places.',
    error: 'USDC supports at most 7 decimal places.',
  },
};

/**
 * The state a form opens in before anything has been typed. Worth a story of its
 * own because it is the one an error must not be mistaken for: an empty required
 * field and a rejected value are different problems with different remedies.
 */
export const Empty: Story = {
  args: {
    label: 'Contribution amount (USDC)',
    name: 'amount',
    inputMode: 'decimal',
    error: 'Enter an amount.',
  },
};
