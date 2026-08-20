import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth/context';
import { WalletButton } from '@/components/WalletButton';
import { Button } from '@/components/ui';

const navItems = [
  { to: '/app', label: 'Overview', end: true },
  { to: '/app/groups', label: 'Groups', end: false },
  { to: '/app/activity', label: 'Activity', end: false },
  { to: '/app/settings', label: 'Settings', end: false },
];

/**
 * Shell for authenticated application routes.
 *
 * The account and the wallet are shown as two separate things, because they are
 * two separate things: signing out ends the session without disconnecting the
 * wallet, and disconnecting the wallet does not sign the user out. Presenting
 * them as one control would imply a link that does not exist, and that
 * impression is exactly what a non-custodial design must not create.
 */
export function AppLayout() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [pending, setPending] = useState(false);

  async function onSignOut(): Promise<void> {
    setPending(true);
    // Never rejects, and clears the local session even if the revocation call
    // fails, so there is no failure case to handle here.
    await signOut();
    setPending(false);
    void navigate('/', { replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <nav
          aria-label="Application"
          className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4"
        >
          <NavLink to="/" className="text-sm font-semibold tracking-tight">
            Susu Protocol
          </NavLink>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive
                      ? 'font-medium text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {user?.email === undefined ? null : (
              <span
                title={user.email}
                className="max-w-[16ch] truncate text-xs text-neutral-500 sm:max-w-none"
              >
                {user.email}
              </span>
            )}
            <Button variant="ghost" onClick={onSignOut} pending={pending}>
              Sign out
            </Button>
            <WalletButton />
          </div>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
