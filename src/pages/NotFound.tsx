import { Link } from 'react-router';
import { buttonClasses } from '@/components/button-styles';

/**
 * The page for a route that does not exist.
 *
 * Off the shell on purpose: this renders for any unknown path, including one
 * visited with no session, so it cannot assume the authenticated layout is
 * around it.
 */
export function NotFound() {
  return (
    <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
      <Link
        to="/"
        className="text-sm font-semibold tracking-tight text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        Susu Protocol
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        There is nothing at this address. The link may be old, or the address may have a typo in it.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link to="/" className={buttonClasses()}>
          Go to the home page
        </Link>
        <Link to="/app" className={buttonClasses('secondary')}>
          Open the app
        </Link>
      </div>
    </section>
  );
}
