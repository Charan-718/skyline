import { Compass } from '@phosphor-icons/react';
import { EmptyState } from '../components/feedback';
import { Button } from '../components/Button';

export default function NotFound() {
  return (
    <div className="card">
      <h1 className="sr-only" tabIndex={-1} data-page-title>
        Page not found
      </h1>
      <EmptyState icon={Compass} title="We couldn't find that page" action={<Button variant="primary" to="/home">Back to home</Button>}>
        The link may be broken, or the page may have moved.
      </EmptyState>
    </div>
  );
}
