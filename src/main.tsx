import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from './routes/router';
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
      <Router />
    </QueryClientProvider>
  </StrictMode>,
);
