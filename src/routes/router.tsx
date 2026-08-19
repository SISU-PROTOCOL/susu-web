import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './AppLayout';
import { RequireAuth } from './RequireAuth';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/auth/Login';
import { Signup } from '@/pages/auth/Signup';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { ResetPassword } from '@/pages/auth/ResetPassword';
import { JoinInvite } from '@/pages/JoinInvite';
import { Dashboard } from '@/pages/app/Dashboard';
import { Groups } from '@/pages/app/Groups';
import { CreateGroup } from '@/pages/app/CreateGroup';
import { GroupDetail } from '@/pages/app/GroupDetail';
import { Activity } from '@/pages/app/Activity';
import { Settings } from '@/pages/app/Settings';
import { TransactionDetail } from '@/pages/app/TransactionDetail';
import { NotFound } from '@/pages/NotFound';

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/join/:inviteCode', element: <JoinInvite /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'groups', element: <Groups /> },
      { path: 'groups/create', element: <CreateGroup /> },
      { path: 'groups/:id', element: <GroupDetail /> },
      { path: 'activity', element: <Activity /> },
      { path: 'settings', element: <Settings /> },
      { path: 'transactions/:hash', element: <TransactionDetail /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
