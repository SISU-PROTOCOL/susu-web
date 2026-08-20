import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * Shared frame for the signed-out pages.
 *
 * The four auth screens — sign in, sign up, forgot and reset — differ only in
 * their form and their copy. Sharing the frame keeps the heading level, the
 * spacing and the banner consistent, so a change to one is a change to all
 * rather than four screens that slowly drift apart.
 *
 * Each page has exactly one `h1`, and it is here. A form that rendered its own
 * heading as well would give the page two, which makes the document outline
 * ambiguous for a screen reader.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
      <Link
        to="/"
        className="text-sm font-semibold tracking-tight text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        Susu Protocol
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle === undefined ? null : (
        <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {subtitle}
        </p>
      )}

      <div className="mt-8">{children}</div>

      {footer === undefined ? null : (
        <div className="mt-8 text-sm text-neutral-600 dark:text-neutral-400">{footer}</div>
      )}
    </section>
  );
}
