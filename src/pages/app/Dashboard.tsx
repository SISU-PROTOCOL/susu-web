import { PagePlaceholder } from '@/components/PagePlaceholder';

export function Dashboard() {
  return (
    <PagePlaceholder
      phase="Phase 6"
      title="Overview"
      description="Your groups, the current round, and any action waiting on you. All figures shown here are read from the chain — the application database is a rebuildable index, never the source of truth."
    />
  );
}
