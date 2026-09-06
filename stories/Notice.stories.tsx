import type { Meta, StoryObj } from '@storybook/react-vite';
import { Notice } from '../src/components/ui';

/**
 * The four tones are not four shades of the same message. `Notice` sets
 * `role="alert"` for `danger` alone, so that a status a member should not be
 * interrupted by — a round still waiting — is not announced as though something
 * had gone wrong. The copy in these stories is the copy `OutcomeNotice` renders,
 * because the wording is the whole point of that component and it should be
 * reviewable without a chain to produce it.
 */
const meta = {
  title: 'Primitives/Notice',
  component: Notice,
  argTypes: {
    tone: { control: 'select', options: ['neutral', 'warning', 'danger', 'success'] },
  },
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A statement of fact. Announced politely as a status, not as an alert. */
export const Neutral: Story = {
  args: {
    tone: 'neutral',
    title: 'This round is not complete yet',
    children: <p>Four of six members have contributed.</p>,
  },
};

/**
 * The outcome this app refuses to collapse into success or failure. A
 * transaction the network never reported may still be included in a later
 * ledger, so it is presented as genuinely unresolved — and it is the reason the
 * wording here is the longest of the four.
 */
export const Warning: Story = {
  args: {
    tone: 'warning',
    title: 'We could not confirm what happened',
    children: (
      <p>
        The network did not report this transaction within the polling window. This does not mean it
        failed — it may still be included in a later ledger. Check the block explorer before trying
        again.
      </p>
    ),
  },
};

/**
 * `role="alert"`, and the only tone that gets it. "The network rejected this
 * transaction" is worth interrupting whatever a screen reader was saying.
 */
export const Danger: Story = {
  args: {
    tone: 'danger',
    title: 'The network rejected this transaction',
    children: (
      <p>Insufficient balance. Nothing was changed, but the transaction fee was still spent.</p>
    ),
  },
};

/** The only success there is: the ledger applied it. */
export const Success: Story = {
  args: {
    tone: 'success',
    title: 'Confirmed on-chain',
    children: <p>Applied in ledger 1 294 118.</p>,
  },
};

/**
 * Without a title the message is the whole notice, and the spacing that
 * separates a heading from its body is dropped with it.
 */
export const MessageOnly: Story = {
  args: {
    tone: 'neutral',
    children: <p>Nothing here has been signed yet.</p>,
  },
};
