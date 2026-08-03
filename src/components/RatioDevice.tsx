import type { RatioPart } from '../data/ratios';

/**
 * The signature element (design system §Shape): large numerals with
 * letterspaced labels. Skeleton markup — Caslon/brass styling lands with the
 * design system.
 */
export function RatioDevice({ parts }: { parts: RatioPart[] }) {
  return (
    <figure class="ratio-device">
      <div class="ratio-values">{parts.map((p) => p.value).join(' : ')}</div>
      <figcaption class="ratio-labels">
        {parts.map((p) => p.label).join(' · ')}
      </figcaption>
    </figure>
  );
}
