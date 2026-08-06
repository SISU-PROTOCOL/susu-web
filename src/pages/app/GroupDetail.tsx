import { useParams } from 'react-router';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export function GroupDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <PagePlaceholder
      phase="Phase 6"
      title="Group detail"
      description={`Group ${id ?? 'unknown'}: members, payout order, current round, contribution status, and payout execution. Payout can be triggered by anyone once the round is fully funded — every check is enforced by the contract, not by this page.`}
    />
  );
}
