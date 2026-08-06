import { NavLink, Outlet } from 'react-router';

const navItems = [
  { to: '/app', label: 'Overview', end: true },
  { to: '/app/groups', label: 'Groups', end: false },
  { to: '/app/activity', label: 'Activity', end: false },
  { to: '/app/settings', label: 'Settings', end: false },
];

/** Shell for authenticated application routes. */
export function AppLayout() {
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
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
