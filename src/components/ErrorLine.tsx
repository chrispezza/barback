import { Button } from '@ds/core/Button';

/** Inline failure voice — quiet, honest, never a modal (frontend-spec §5). */
export function ErrorLine({ onRetry }: { onRetry?: () => void }) {
  return (
    <p class="recipe-aside" role="alert">
      The bar didn’t answer — try again.{' '}
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </p>
  );
}
