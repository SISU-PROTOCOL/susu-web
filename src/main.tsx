import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from './routes/router';
import { AuthProvider } from './components/AuthProvider';
import { WalletProvider } from './components/WalletProvider';
import { MotionProvider } from './components/motion';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Chain state changes on ledger close; refetching on focus is cheap and useful.
      refetchOnWindowFocus: true,
      retry: 2,
      staleTime: 5_000,
    },
  },
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root was not found in the document.');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* The session is provided at the root so that public routes — the login
            and signup forms themselves, and a recovery link landing on
            /reset-password — can read and establish it. */}
      <AuthProvider>
        {/* The wallet session is provided at the root too, so that routes
              outside the authenticated shell — an invite link, for instance —
              can connect without an account. */}
        <WalletProvider>
          {/* Motion is configured once, here. It is provided inside the others
                so that a route transition animates the content it wraps, and
                so that a component using `m` is never rendered without the
                feature set that makes it work. */}
          <MotionProvider>
            <Router />
          </MotionProvider>
        </WalletProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
