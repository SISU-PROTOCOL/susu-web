/**
 * Saying what a decoded event was.
 *
 * The feed is a list of what the contracts emitted, and an event's name is an
 * identifier like `contribution` or `recipient_amount`. Rendering those raw in a
 * user-facing list is the kind of thing that reads as a developer tool, and the
 * alternative — a switch statement inside the component — puts wording and
 * payload-shape knowledge in the one place that cannot be tested without a DOM.
 *
 * So this is a pure function over a name and a payload, and the payload is
 * treated as untrusted. It comes from the API, which decoded it from chain bytes;
 * a field that is missing, or the wrong type, means the decoder and this module
 * disagree, and that must render as a vague line rather than as `NaN USDC` or a
 * thrown error that blanks the page.
 *
 * AMOUNTS STAY STRINGS
 * Every amount here is a base-unit integer carried as a string, exactly as the
 * indexer holds it. Parsing one into a number to reformat it would undo the care
 * taken on the other side of the wire, so this returns the string and leaves
 * formatting to `formatBaseUnits`.
 */

export type EventDescription = {
  /** A sentence fragment, capitalised, for a list row. */
  readonly title: string;
  /** The counterparty the event names, when it names one. */
  readonly address?: string;
  /** Base units, as a string, when the event carries an amount. */
  readonly amount?: string;
  /** A qualifier such as `round 3`. */
  readonly detail?: string;
};

type Payload = Record<string, unknown>;

function payloadOf(value: unknown): Payload {
  return typeof value === 'object' && value !== null ? (value as Payload) : {};
}

function stringField(payload: Payload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function numberField(payload: Payload, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * `contribution_paused` becomes `Contribution paused`.
 *
 * Used for a name this module does not know, which is what a contract upgrade
 * that adds an event looks like from here. Showing the event with an approximated
 * label is deliberate: the feed is a record of everything that happened, and
 * dropping rows because the wording is missing would make the record quietly
 * incomplete.
 */
function humanise(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').trim();
  if (words === '') return 'Event';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function describeEvent(name: string, payload: unknown): EventDescription {
  const fields = payloadOf(payload);
  const round = numberField(fields, 'round');

  switch (name) {
    case 'contribution': {
      const address = stringField(fields, 'member');
      const amount = stringField(fields, 'amount');
      return {
        title: 'Contribution',
        ...(address === undefined ? {} : { address }),
        ...(amount === undefined ? {} : { amount }),
        ...(round === undefined ? {} : { detail: `round ${round}` }),
      };
    }

    case 'payout': {
      const address = stringField(fields, 'recipient');
      const amount = stringField(fields, 'recipientAmount');
      return {
        title: 'Payout',
        ...(address === undefined ? {} : { address }),
        ...(amount === undefined ? {} : { amount }),
        ...(round === undefined ? {} : { detail: `round ${round} · net of fee` }),
      };
    }

    case 'fee': {
      const address = stringField(fields, 'treasury');
      const amount = stringField(fields, 'fee');
      return {
        title: 'Protocol fee',
        ...(address === undefined ? {} : { address }),
        ...(amount === undefined ? {} : { amount }),
        ...(round === undefined ? {} : { detail: `round ${round}` }),
      };
    }

    case 'join': {
      const address = stringField(fields, 'member');
      const position = numberField(fields, 'position');
      return {
        title: 'Member joined',
        ...(address === undefined ? {} : { address }),
        // The position is the contract's own payout order, so it is worth
        // showing: a member's place in the queue is the thing they joined for.
        ...(position === undefined ? {} : { detail: `position ${position}` }),
      };
    }

    case 'start': {
      const memberCount = numberField(fields, 'memberCount');
      return {
        title: 'Group started',
        ...(memberCount === undefined ? {} : { detail: `${memberCount} members` }),
      };
    }

    case 'completed': {
      const rounds = numberField(fields, 'rounds');
      return {
        title: 'Group completed',
        ...(rounds === undefined ? {} : { detail: `${rounds} rounds paid out` }),
      };
    }

    case 'group_created': {
      const address = stringField(fields, 'creator');
      const capacity = numberField(fields, 'memberCapacity');
      return {
        title: 'Group created',
        ...(address === undefined ? {} : { address }),
        ...(capacity === undefined ? {} : { detail: `capacity ${capacity}` }),
      };
    }

    case 'fee_updated': {
      const feeBps = numberField(fields, 'feeBps');
      return {
        title: 'Protocol fee changed',
        ...(feeBps === undefined ? {} : { detail: `${feeBps / 100}%` }),
      };
    }

    case 'treasury_updated': {
      const address = stringField(fields, 'treasury');
      return {
        title: 'Treasury changed',
        ...(address === undefined ? {} : { address }),
      };
    }

    case 'pause_updated':
      return {
        title: fields['paused'] === true ? 'Group creation paused' : 'Group creation resumed',
      };

    default:
      return { title: humanise(name) };
  }
}
