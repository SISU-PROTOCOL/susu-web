import { useParams } from 'react-router';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export function JoinInvite() {
  const { inviteCode } = useParams<{ inviteCode: string }>();

  return (
    <PagePlaceholder
      phase="Phase 5"
      title="Join a Susu group"
      description={`You are opening an invite${
        inviteCode ? ` (${inviteCode})` : ''
      }. Invite codes are opaque, single-purpose, and may expire. Joining is validated server-side and on-chain — capacity, group status, and wallet uniqueness are all enforced.`}
    />
  );
}
