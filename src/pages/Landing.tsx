import { PagePlaceholder } from '@/components/PagePlaceholder';

export function Landing() {
  return (
    <PagePlaceholder
      phase="Phase 8"
      title="Save together. Without the trust issues."
      description="Susu Protocol is a non-custodial rotating savings protocol on Stellar. Members contribute a fixed amount at a fixed interval; each round, the pool goes to the scheduled recipient, minus a transparent 0.50% protocol fee. Smart contracts hold the funds and enforce the rules."
    />
  );
}
