import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/lib/auth/context';
import { getEnv } from '@/lib/env';
import { buttonClasses } from '@/components/button-styles';

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
 */
export function Landing() {
  const { status } = useAuth();
  const env = getEnv();

  const network = env.VITE_STELLAR_NETWORK;
  const onTestnet = network !== 'mainnet';

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4"
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
        <section className="mx-auto max-w-3xl px-6 pt-16 pb-10">
          {onTestnet ? (
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Running on Stellar {network}. Not mainnet — do not use real funds.
            </p>
          ) : null}

          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
            Save together. Without the trust issues.
          </h1>

          <p className="mt-5 text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
            Susu is a rotating savings circle: a group agrees a fixed contribution and a fixed
            interval, and each round the whole pool goes to one member — in turn, until everyone has
            had it once. It is an old arrangement, and it works. What usually breaks it is having to
            trust whoever is holding the money.
          </p>

          <p className="mt-4 text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
            Here, nobody holds it. A Soroban smart contract on Stellar does, and it releases funds
            only to the recipient the schedule names.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to={status === 'authenticated' ? '/app' : '/signup'} className={buttonClasses()}>
              {status === 'authenticated' ? 'Open the app' : 'Start a circle'}
            </Link>
            <a href="#how-it-works" className={buttonClasses('secondary')}>
              How it works
            </a>
          </div>
        </section>

        <section
          id="how-it-works"
          className="mx-auto max-w-3xl scroll-mt-8 px-6 py-10"
          aria-labelledby="how-it-works-heading"
        >
          <h2 id="how-it-works-heading" className="text-2xl font-semibold tracking-tight">
            How a circle runs
          </h2>
          <ol className="mt-6 space-y-5">
            <Step number={1} title="A creator sets the terms">
              The contribution amount, how often it is due, the member capacity, and the fee the
              group will pay. Those terms are fixed when the group is created, and the contract
              rejects a fee above 0.50%.
            </Step>
            <Step number={2} title="Members join and the schedule is set">
              Joining assigns a position. The payout order follows it, so everybody can see the
              order they will be paid in before a single contribution is made.
            </Step>
            <Step number={3} title="Everyone contributes each round">
              Each member transfers the contribution into the contract. The contract records who has
              paid, and a round cannot be paid out until everyone due has paid.
            </Step>
            <Step number={4} title="The pool goes to that round's recipient">
              The contract releases the pool to the member the schedule names, less the group's fee
              — at most 0.50%, enforced by the contract rather than promised by us.
            </Step>
            <Step number={5} title="The circle completes">
              Once every member has received once, the group is done. It holds nothing afterwards,
              and there is no step where an operator could keep a remainder.
            </Step>
          </ol>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-10">
          <h2 className="text-2xl font-semibold tracking-tight">
            What makes this different from a promise
          </h2>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2">
            <Claim title="The funds are never ours">
              Contributions sit in the group's own contract. Money leaves it only to the round's
              scheduled recipient and to the treasury's fee, and only through the contract's own
              payout — there is no withdrawal function for the creator, an admin, this backend, or
              the indexer, and no upgrade path by which one could be added later. That is a property
              of deployed code you can read, not of our good intentions.
            </Claim>
            <Claim title="The rules run whether we are here or not">
              Payout order, contribution size, and the fee ceiling are enforced on-chain. The only
              switch this project holds is the factory's pause, and it stops new groups being
              created — it cannot touch a group that already exists, let alone its money. The
              frontend you are reading is a convenience; closing it changes nothing.
            </Claim>
            <Claim title="An account is not a wallet">
              Signing up takes an email and a password. It gives you a name and a place to keep your
              groups — it cannot move a single unit. Every payment needs a signature from a wallet
              only you hold.
            </Claim>
            <Claim title="Everything is checkable">
              Groups, contributions, and payouts are events on a public ledger, and the contract
              that produced them is deployed and verifiable by address. You do not have to take this
              page's word for any of it.
            </Claim>
          </dl>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-10">
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
                A susu is not a deposit account. If a member does not pay their round, the contract
                cannot make them, and the group waits. That risk is the group's, as it always was.
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
        </section>

        <section className="mx-auto max-w-3xl px-6 pt-6 pb-16">
          <h2 className="text-2xl font-semibold tracking-tight">Start a circle</h2>
          <p className="mt-3 text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
            You will need an account, and a Stellar wallet such as Freighter to link when you are
            ready to contribute. You can set up the group and invite people before linking anything.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to={status === 'authenticated' ? '/app' : '/signup'} className={buttonClasses()}>
              {status === 'authenticated' ? 'Open the app' : 'Create an account'}
            </Link>
            {status === 'authenticated' ? null : (
              <Link to="/login" className={buttonClasses('secondary')}>
                Sign in
              </Link>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-6 text-xs text-neutral-500">
          <span>Susu Protocol — non-custodial rotating savings on Stellar.</span>
          <span className="ml-auto font-mono" title={env.VITE_STELLAR_NETWORK}>
            {network}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
      >
        {number}
      </span>
      <div>
        <h3 className="font-medium tracking-tight">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {children}
        </p>
      </div>
    </li>
  );
}

function Claim({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium tracking-tight">{title}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {children}
      </dd>
    </div>
  );
}
