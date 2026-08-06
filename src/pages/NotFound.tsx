import { Link } from 'react-router';
import { PagePlaceholder } from '@/components/PagePlaceholder';

export function NotFound() {
  return (
    <div>
      <PagePlaceholder
        phase="Phase 6"
        title="Page not found"
        description="That route does not exist. Check the address, or head back to the landing page."
      />
      <p className="mx-auto -mt-8 max-w-2xl px-6">
        <Link to="/" className="text-sm font-medium underline underline-offset-4">
          Back to home
        </Link>
      </p>
    </div>
  );
}
