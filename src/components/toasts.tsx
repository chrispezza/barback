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

export function ToastHost() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    push = setToast;
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div class="toast-host">
      <Toast
        message={toast.message}
        tone={toast.tone}
        actionLabel={toast.actionLabel}
        onAction={() => {
          toast.onAction?.();
          setToast(null);
        }}
      />
    </div>
  );
}
