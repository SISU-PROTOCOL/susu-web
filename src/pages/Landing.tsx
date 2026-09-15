import { useState, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Link } from 'react-router';
import { useAuth } from '@/lib/auth/context';
import { getEnv } from '@/lib/env';
import { buttonClasses } from '@/components/button-styles';
import { Blobs, Reveal, Sticker } from '@/components/motion';

/**
 * The public front page.
 *
 * WHAT THIS PAGE MAY AND MAY NOT SAY
 * Everything here is a statement about the deployed protocol, and each one is
 * checkable: the fee ceiling is `MAX_FEE_BPS` in the Group contract, the custody
 * claim is the absence of any withdraw path, and the network is whatever
 * `VITE_STELLAR_NETWORK` says it is. There are deliberately no testimonials, no
 * member counts, and no "trusted by" logos — inventing social proof for a
 * protocol whose entire argument is that you should not have to trust anyone
 * would undercut the thing being sold.
 *
 * The fee is described as a ceiling rather than a rate because that is what the
 * contract enforces: `fee_bps` is per-group, cannot be zero, and cannot exceed
 * 50. Quoting "0.50%" as if it were fixed would be a smaller number than the
 * truth for most groups, which is the wrong way to be wrong about money.
 *
 * MOTION HERE IS SEQUENCING, NOT DECORATION
 * The page makes an argument in stages — what a susu is, how a round runs, what
 * makes this one different — so each stage arrives as the reader reaches it, and
 * the numbered steps arrive in their own order because their number is the point.
 * It is all optional: `Reveal` renders its children plainly for a reader who has
 * asked for reduced motion, and everything is visible without scripting at all.
 *
 * WHY THE STEPS ARE A FAN, AND WHY IT IS NOT ONE ON A PHONE
 * The five steps are dealt out on an arc, and picking one brings it forward. That
 * is a nice way to show five things that happen in order without a wall of text,
 * and the order is still the layout's structure rather than a decoration applied
 * to it: the markup stays an `ol` of `li`, so the sequence survives without CSS.
 *
 * The arc stops at 900px and becomes a column. A fan is only readable because the
 * cards are big; on a narrow screen they would overlap into an unreadable pile,
 * and no amount of animation makes that worth it. When it stacks, all five are
 * legible at once and the focus control is not merely disabled — it is
 * unnecessary, so it is not rendered at all.
 */
export function Landing() {
  const { status } = useAuth();
  const env = getEnv();

  const network = env.VITE_STELLAR_NETWORK;
  const onTestnet = network !== 'mainnet';

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="relative border-b border-neutral-200 dark:border-neutral-800">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6"
        >
          <span className="text-sm font-semibold tracking-tight">Susu Protocol</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {status === 'authenticated' ? (
              <Link to="/app" className={buttonClasses('primary')}>
                Open the app
              </Link>
            ) : (
              <>
                <Link to="/login" className={buttonClasses('ghost')}>
                  Sign in
                </Link>
                <Link to="/signup" className={buttonClasses('primary')}>
                  Create an account
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* Hero. The blobs sit behind a `relative` + `overflow-hidden` section so
            they cannot widen the page or catch a click. */}
        <section className="relative overflow-hidden">
          <Blobs palette="warm" className="opacity-70" />

          <div className="relative mx-auto max-w-3xl px-4 pt-16 pb-10 sm:px-6">
            <Reveal>
              {onTestnet ? (
                <p className="inline-block rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-pretty text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  Running on Stellar {network}. Not mainnet — do not use real funds.
                </p>
              ) : null}

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Save together. Without the trust issues.
              </h1>

              <p className="mt-5 text-lg leading-relaxed text-pretty text-neutral-700 dark:text-neutral-300">
                Susu is a rotating savings circle: a group agrees a fixed contribution and a fixed
                interval, and each round the whole pool goes to one member — in turn, until everyone
                has had it once. It is an old arrangement, and it works. What usually breaks it is
                having to trust whoever is holding the money.
              </p>

              <p className="mt-4 text-lg leading-relaxed text-pretty text-neutral-700 dark:text-neutral-300">
                Here, nobody holds it. A Soroban smart contract on Stellar does, and it releases
                funds only to the recipient the schedule names.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to={status === 'authenticated' ? '/app' : '/signup'}
                  className={buttonClasses()}
                >
                  {status === 'authenticated' ? 'Open the app' : 'Start a circle'}
                </Link>
                <a href="#how-it-works" className={buttonClasses('secondary')}>
                  How it works
                </a>
                {/* A badge rather than a sentence, because the ceiling is a fact
                    about the contract rather than a feature of the product. */}
                <Sticker
                  tilt={-3}
                  className="ml-1 border-2 border-neutral-900 bg-amber-100 px-3 py-1 text-xs font-semibold text-neutral-900 dark:border-neutral-100 dark:bg-amber-200"
                >
                  fees capped at most 0.50%
                </Sticker>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          id="how-it-works"
          className="mx-auto max-w-5xl scroll-mt-8 px-4 py-10 sm:px-6"
          aria-labelledby="how-it-works-heading"
        >
          <Reveal>
            <h2
              id="how-it-works-heading"
              className="text-2xl font-semibold tracking-tight text-balance"
            >
              How a circle runs
            </h2>
          </Reveal>

          <Steps />
        </section>

        <section className="relative overflow-hidden">
          <Blobs palette="cool" className="opacity-50" />

          <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6">
            <Reveal>
              <h2 className="text-2xl font-semibold tracking-tight text-balance">
                What makes this different from a promise
              </h2>
            </Reveal>
            <dl className="mt-6 grid gap-6 sm:grid-cols-2">
              <Claim title="The funds are never ours" delay={0} tilt={-1.1} accent="amber">
                Contributions sit in the group's own contract. Money leaves it only to the round's
                scheduled recipient and to the treasury's fee, and only through the contract's own
                payout — there is no withdrawal function for the creator, an admin, this backend, or
                the indexer, and no upgrade path by which one could be added later. That is a
                property of deployed code you can read, not of our good intentions.
              </Claim>
              <Claim
                title="The rules run whether we are here or not"
                delay={0.05}
                tilt={1.1}
                accent="emerald"
              >
                Payout order, contribution size, and the fee ceiling are enforced on-chain. The only
                switch this project holds is the factory's pause, and it stops new groups being
                created — it cannot touch a group that already exists, let alone its money. The
                frontend you are reading is a convenience; closing it changes nothing.
              </Claim>
              <Claim title="An account is not a wallet" delay={0.1} tilt={0.9} accent="sky">
                Signing up takes an email and a password. It gives you a name and a place to keep
                your groups — it cannot move a single unit. Every payment needs a signature from a
                wallet only you hold.
              </Claim>
              <Claim title="Everything is checkable" delay={0.15} tilt={-0.9} accent="neutral">
                Groups, contributions, and payouts are events on a public ledger, and the contract
                that produced them is deployed and verifiable by address. You do not have to take
                this page's word for any of it.
              </Claim>
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <Reveal>
            <div className="rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
              <h2 className="text-lg font-semibold tracking-tight">What this is not, yet</h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                <li>
                  <strong className="font-medium text-neutral-900 dark:text-neutral-100">
                    Not mainnet.
                  </strong>{' '}
                  The contracts are deployed to {network}. Treat anything here as a rehearsal — the
                  balances have no value.
                </li>
                <li>
                  <strong className="font-medium text-neutral-900 dark:text-neutral-100">
                    Not a bank, and not insured.
                  </strong>{' '}
                  A susu is not a deposit account. If a member does not pay their round, the
                  contract cannot make them, and the group waits. That risk is the group's, as it
                  always was.
                </li>
                <li>
                  <strong className="font-medium text-neutral-900 dark:text-neutral-100">
                    Not a way to earn a yield.
                  </strong>{' '}
                  Money in a group is not invested and does not grow. What you receive is what the
                  other members pay in.
                </li>
              </ul>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight text-balance">Start a circle</h2>
            <p className="mt-3 text-base leading-relaxed text-pretty text-neutral-600 dark:text-neutral-400">
              You will need an account, and a Stellar wallet such as Freighter to link when you are
              ready to contribute. You can set up the group and invite people before linking
              anything.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to={status === 'authenticated' ? '/app' : '/signup'}
                className={buttonClasses()}
              >
                {status === 'authenticated' ? 'Open the app' : 'Create an account'}
              </Link>
              {status === 'authenticated' ? null : (
                <Link to="/login" className={buttonClasses('secondary')}>
                  Sign in
                </Link>
              )}
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-neutral-500 sm:px-6">
          <span>Susu Protocol — non-custodial rotating savings on Stellar.</span>
          <span className="ml-auto font-mono" title={env.VITE_STELLAR_NETWORK}>
            {network}
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * The five steps, dealt onto an arc.
 *
 * The markup is an `ol` of `li` in both branches, so the ordering is carried by
 * the document rather than by the transforms — which is what lets the fan be
 * dropped entirely for a reader who does not want motion without losing the
 * meaning of the section.
 */
function Steps() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);

  if (reduced === true) {
    return (
      <ol className="mt-6 space-y-5">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <StepCard step={step} index={index} />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol
      className="fan mt-8 h-108 max-[900px]:mt-6"
      data-has-active={active !== null}
      // Clicking the space between the cards releases the focused one, so the arc
      // can always be returned to its resting shape.
      onClick={(event) => {
        if (event.target === event.currentTarget) setActive(null);
      }}
    >
      {STEPS.map((step, index) => {
        const placement = fanPlacement(index, STEPS.length);
        const isActive = active === index;

        return (
          <li
            key={step.title}
            className="fan-card settles w-76"
            data-active={isActive}
            style={
              {
                '--fan-rotation': `${placement.rotation}deg`,
                '--fan-x': `${placement.x}px`,
                // A custom property, not `zIndex`. An inline `z-index` would beat
                // the `:hover` and `[data-active]` rules that lift a focused card
                // above its neighbours, which is the whole point of the fan.
                '--fan-z': placement.zIndex,
              } as CSSProperties
            }
          >
            <StepCard
              step={step}
              index={index}
              active={isActive}
              onToggle={() => setActive(isActive ? null : index)}
            />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Where the nth of `count` cards sits on the arc.
 *
 * Rotation and offset both scale with distance from the middle, so the cards
 * spread evenly however many there are rather than needing a table per count.
 * The middle card gets the highest `z-index`, which is what makes the fan read
 * as a deck rather than as a stack in reading order.
 */
function fanPlacement(index: number, count: number) {
  if (count <= 1) return { rotation: 0, x: 0, zIndex: 10 };

  const middle = (count - 1) / 2;
  const distance = (index - middle) / middle; // -1 at the left edge, +1 at the right

  return {
    rotation: distance * 16,
    x: Math.round(distance * 150),
    zIndex: 10 + Math.round(count - Math.abs(index - middle)),
  };
}

/** The accent hues, as bare RGB triplets so `index.css` can build opaque and
 * translucent variants from one value — `rgb(var(--accent))` and
 * `rgb(var(--accent) / 0.16)`. */
const STEP_ACCENTS = [
  '245 158 11', // amber
  '16 185 129', // emerald
  '14 165 233', // sky
  '139 92 246', // violet
  '244 63 94', // rose
] as const;

const CLAIM_ACCENTS = {
  amber: '251 191 36',
  emerald: '52 211 153',
  sky: '56 189 248',
  neutral: '163 163 163',
} as const;

/** One card face.
 *
 * The number appears twice on purpose, at two different weights: a crisp badge
 * that straightens when the card is hovered or holds focus — the gesture of
 * picking it up — and a large watermark numeral that gives the card its colour
 * and weight without competing to be read.
 *
 * When `onToggle` is absent the card is inert: no button, so nothing is announced
 * as interactive and nothing is reachable by keyboard that does nothing. That is
 * the case in the stacked layout, where every card is already fully visible.
 */
function StepCard({
  step,
  index,
  active,
  onToggle,
}: {
  step: (typeof STEPS)[number];
  index: number;
  active?: boolean;
  onToggle?: () => void;
}) {
  const heading = <h3 className="text-[1.0625rem] font-semibold tracking-tight">{step.title}</h3>;

  return (
    <div
      className="step-card"
      style={{ '--accent': STEP_ACCENTS[index % STEP_ACCENTS.length] } as CSSProperties}
    >
      {/* Decorative, and `aria-hidden`: the badge below carries the same number
          in a form that can actually be read. */}
      <span aria-hidden="true" className="step-card__numeral">
        {index + 1}
      </span>

      {/* Above the watermark, which is what keeps the numeral behind the text. */}
      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex items-start gap-3">
          <Sticker
            tilt={index % 2 === 0 ? -7 : 6}
            className="step-card__badge mt-0.5 size-8 shrink-0 border-2 text-sm font-bold"
          >
            {index + 1}
          </Sticker>

          {onToggle ? (
            // The heading is the control. `aria-pressed` is the honest
            // description: this does not disclose content that was hidden, it
            // picks one card out of the arc, which is a toggle.
            <button
              type="button"
              aria-pressed={active === true}
              onClick={onToggle}
              className="cursor-pointer text-left"
            >
              {heading}
            </button>
          ) : (
            heading
          )}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {step.body}
        </p>
      </div>
    </div>
  );
}

/** One claim. A `div` is permitted as a `dl` child, which is what the grid needs. */
function Claim({
  title,
  delay,
  tilt,
  accent,
  children,
}: {
  title: string;
  delay: number;
  tilt: number;
  accent: keyof typeof CLAIM_ACCENTS;
  children: ReactNode;
}) {
  // `Reveal` is the `dl > div` wrapper, and it has to be — a `dt`/`dd` pair
  // nested one level deeper than the `div` that `dl` allows would be invalid
  // markup. So the card's own styling goes on `Reveal` itself, which is why the
  // tilt uses the `rotate` property rather than `transform`: `Reveal` animates
  // `transform` inline, and the two would otherwise fight over one property.
  return (
    <Reveal
      delay={delay}
      className="settle settles flex flex-col rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
      style={{ '--tilt': `${tilt}deg`, '--accent': CLAIM_ACCENTS[accent] } as CSSProperties}
    >
      <dt className="font-medium tracking-tight">{title}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {children}
      </dd>
    </Reveal>
  );
}

/**
 * The five steps, as content.
 *
 * Kept as data rather than as five JSX blocks because the fan needs to index
 * them — for the angle, the offset and the number — and deriving those from
 * position is what keeps the arc correct if a step is ever added or removed.
 */
const STEPS = [
  {
    title: 'A creator sets the terms',
    body: (
      <>
        The contribution amount, how often it is due, the member capacity, and the fee the group
        will pay. Those terms are fixed when the group is created, and the contract rejects a fee
        above 0.50%.
      </>
    ),
  },
  {
    title: 'Members join and the schedule is set',
    body: (
      <>
        Joining assigns a position. The payout order follows it, so everybody can see the order they
        will be paid in before a single contribution is made.
      </>
    ),
  },
  {
    title: 'Everyone contributes each round',
    body: (
      <>
        Each member transfers the contribution into the contract. The contract records who has paid,
        and a round cannot be paid out until everyone due has paid.
      </>
    ),
  },
  {
    title: "The pool goes to that round's recipient",
    body: (
      <>
        The contract releases the pool to the member the schedule names, less the group's fee — at
        most 0.50%, enforced by the contract rather than promised by us.
      </>
    ),
  },
  {
    title: 'The circle completes',
    body: (
      <>
        Once every member has received once, the group is done. It holds nothing afterwards, and
        there is no step where an operator could keep a remainder.
      </>
    ),
  },
] as const;
