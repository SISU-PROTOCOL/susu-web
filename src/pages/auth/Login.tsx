import { PagePlaceholder } from '@/components/PagePlaceholder';

export function Login() {
  return (
    <PagePlaceholder
      phase="Phase 4"
      title="Log in"
      description="Email and password authentication is handled by Supabase Auth. Sessions persist and refresh automatically."
    />
  );
}
