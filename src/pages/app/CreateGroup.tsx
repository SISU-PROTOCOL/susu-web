import { PagePlaceholder } from '@/components/PagePlaceholder';

export function CreateGroup() {
  return (
    <PagePlaceholder
      phase="Phase 6"
      title="Create a Susu group"
      description="Set the name, description, contribution amount, frequency, member count, and payout order. Creating a group deploys its own Soroban contract through the Factory."
    />
  );
}
