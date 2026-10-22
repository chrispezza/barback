// How long a toast stays on screen (ToastHost, toasts.tsx). A toast that
// carries an action (Undo) is a decision, not a receipt: it gets twice the
// time. Kept apart from the host, which renders a design-system component, so
// a journey that counts receipts by time reads these numbers rather than
// copying them (ADR-011).

/** A receipt: says what was done. */
export const RECEIPT_MS = 4000;
/** A toast with an action: the Undo stays offered for this long. */
export const ACTION_MS = 8000;
