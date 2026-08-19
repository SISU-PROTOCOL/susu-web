import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/lib/auth/context';
import { Spinner } from '@/components/ui';

/**
 * Gates the authenticated application behind a session.
 *
 * THE LOADING STATE IS NOT A REDIRECT
 * A persisted session is read asynchronously, so on a cold load the status is
 * undecided for a moment. Redirecting while it is undecided would sign out every
 * user who reloaded the page — they would be sent to the login form, sign in
 * again, and be returned to a page that worked fine. So `loading` renders
 * neither the application nor a redirect, and nothing is decided until the
 * provider has actually decided.
 *
 * WHAT THIS IS NOT
 * This is a routing convenience, not a security boundary. It decides which
 * interface to show, and everything it protects is already protected by row
 * level security on the database and by the chain. A user who bypassed this
 * would see an empty shell and be unable to read or change anything.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-neutral-500">
        <Spinner />
        <span>Loading your session…</span>
      </div>
    );
  }

  if (status === 'anonymous') {
    // The attempted destination travels with the redirect so the user is
    // returned to it after signing in, rather than being dumped on the overview
    // page and having to navigate again. Only a path is kept — see
    // `safeRedirect` in the login page for why the value is not trusted as-is.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
