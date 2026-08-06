import { useParams } from 'react-router';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export function TransactionDetail() {
  const { hash } = useParams<{ hash: string }>();

  return (
    <PagePlaceholder
      phase="Phase 6"
      title="Transaction"
      description={`Transaction ${hash ?? 'unknown'}: submission status, confirmation, decoded contract events, and a link to the block explorer. Success is reported only after the chain confirms it — never merely because a wallet signature succeeded.`}
    />
  );
}
