import { useEffect, useState } from 'preact/hooks';
import { Toast } from '@ds/feedback/Toast';

export interface ToastMessage {
  message: string;
  tone?: 'neutral' | 'destructive';
  actionLabel?: string;
  onAction?: () => void;
}

let push: ((t: ToastMessage) => void) | null = null;

/** Fire-and-forget from anywhere (mutation callbacks included). */
export function showToast(t: ToastMessage): void {
  push?.(t);
}

// A toast that carries an action (Undo) is a decision, not a receipt — it gets
// twice the time and pauses while pointed at or focused. Toasts queue rather
// than replace, so an Undo is never wiped by the next message.
const RECEIPT_MS = 4000;
const ACTION_MS = 8000;

export function ToastHost() {
  const [queue, setQueue] = useState<ToastMessage[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const current = queue[0];

  useEffect(() => {
    push = (t) => setQueue((q) => [...q, t]);
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (!current || isPaused) return;
    const t = setTimeout(
      () => setQueue((q) => q.slice(1)),
      current.actionLabel ? ACTION_MS : RECEIPT_MS,
    );
    return () => clearTimeout(t);
  }, [current, isPaused]);

  if (!current) return null;
  return (
    <div
      class="toast-host"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusIn={() => setIsPaused(true)}
      onFocusOut={() => setIsPaused(false)}
    >
      <Toast
        message={current.message}
        tone={current.tone}
        actionLabel={current.actionLabel}
        onAction={() => {
          current.onAction?.();
          setQueue((q) => q.slice(1));
        }}
      />
    </div>
  );
}
