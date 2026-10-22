import { useLayoutEffect, useRef } from 'preact/hooks';
import { Button } from '@ds/core/Button';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';
/** A heading inside one of these heads that part of the screen, and only it. */
const PARTS = 'section, aside, article, nav';

/**
 * Where focus goes when the line that holds it goes: the nearest heading above
 * it that heads the part of the screen it is in (a heading inside a part the
 * line is not in heads that part), then the screen itself, which has no
 * heading above the line only while it shows the line alone.
 */
function focusTargets(line: HTMLElement): HTMLElement[] {
  const screen = line.closest<HTMLElement>('main') ?? line.ownerDocument.body;
  const above = [...screen.querySelectorAll<HTMLElement>(HEADINGS)].filter((heading) => {
    const part = heading.closest(PARTS);
    const heads = part === null || !screen.contains(part) || part.contains(line);
    return heads && (heading.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  return [...above.reverse(), screen];
}

/**
 * Focus the first target that takes it. A heading is not focusable by itself:
 * it is given tabindex="-1" for as long as it holds focus, so it never joins
 * the tab order and the markup is as it was once focus moves on.
 */
function moveFocus(targets: HTMLElement[]) {
  for (const target of targets) {
    const lent = !target.hasAttribute('tabindex');
    if (lent) target.setAttribute('tabindex', '-1');
    // The screen is a long way to scroll for; a heading is shown where it is.
    target.focus({ preventScroll: target.matches('main, body') });
    if (target.ownerDocument.activeElement === target) {
      if (lent) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      return;
    }
    if (lent) target.removeAttribute('tabindex');
  }
}

/**
 * Inline failure voice — quiet, honest, never a modal (frontend-spec §5).
 *
 * - `announce` (default true): the line is an alert (WCAG 4.1.3). A screen
 *   whose one failure stops several sections announces it once: the other
 *   lines say the same words with `announce={false}` (chrispezza/barback#71).
 * - `retries`: what the Retry asks again ("the drinks you can pour"). It names
 *   the button "Retry …", so several on one screen are told apart; the visible
 *   label stays the one word (the design system's "Iconography": affordances
 *   are words; WCAG 2.5.3, the name starts with it). Without it the button is
 *   named "Retry".
 *
 * A Retry that answers takes the line away, and with it the focused button.
 * Focus then goes to the heading of the part of the screen the line was in,
 * never to <body> (ADR-003 Consequences: focus is handled deliberately).
 */
export function ErrorLine({
  onRetry,
  announce = true,
  retries,
}: {
  onRetry?: () => void;
  announce?: boolean;
  retries?: string;
}) {
  const line = useRef<HTMLParagraphElement>(null);
  // A layout effect, so its cleanup is in place from the first commit: it runs
  // as the line unmounts, while the line and the headings around it are still
  // in the document and the focused button has not yet gone.
  useLayoutEffect(() => {
    const el = line.current;
    return () => {
      if (el !== null && el.contains(el.ownerDocument.activeElement)) moveFocus(focusTargets(el));
    };
  }, []);
  return (
    <p ref={line} class="recipe-aside" role={announce ? 'alert' : undefined}>
      The bar didn’t answer — try again.{' '}
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={retries === undefined ? undefined : `Retry ${retries}`}
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </p>
  );
}
