import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

// ── Per-toast item ─────────────────────────────────────────────────────────
function ToastItem({
  toast,
  onRemove,
}: {
  toast: ToastMessage;
  onRemove: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 260);
  };

  useEffect(() => {
    const t = setTimeout(dismiss, toast.duration ?? 4000);
    return () => clearTimeout(t);
  }, [toast.id]);

  const CFG: Record<ToastVariant, { icon: React.ReactNode; border: string; text: string; iconBg: string }> = {
    success: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      border: 'border-green-500/30', text: 'text-green-400', iconBg: 'bg-green-500/15',
    },
    error: {
      icon: <XCircle className="w-4 h-4" />,
      border: 'border-red-500/30', text: 'text-red-400', iconBg: 'bg-red-500/15',
    },
    warning: {
      icon: <AlertTriangle className="w-4 h-4" />,
      border: 'border-amber-500/30', text: 'text-amber-400', iconBg: 'bg-amber-500/15',
    },
    info: {
      icon: <Info className="w-4 h-4" />,
      border: 'border-accentCyan/30', text: 'text-accentCyan', iconBg: 'bg-accentCyan/15',
    },
  };

  const v = toast.variant ?? 'success';
  const cfg = CFG[v];

  return (
    <div
      className={[
        'flex items-center gap-3 bg-darkCard border rounded-xl shadow-2xl',
        'px-4 py-3 max-w-sm w-full pointer-events-auto',
        cfg.border,
        exiting ? 'animate-slide-out-right' : 'animate-slide-in-right',
      ].join(' ')}
    >
      <div className={`w-7 h-7 rounded-lg ${cfg.iconBg} flex items-center justify-center flex-shrink-0 ${cfg.text}`}>
        {cfg.icon}
      </div>
      <p className={`flex-1 text-sm font-medium ${cfg.text}`}>{toast.message}</p>
      <button
        onClick={dismiss}
        className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Toast container (fixed portal) ────────────────────────────────────────
export function ToastContainer({ toasts, onRemove }: {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

// ── useToast hook ──────────────────────────────────────────────────────────
let _counter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const add = (message: string, variant: ToastVariant = 'success', duration = 4000) => {
    const id = String(++_counter);
    setToasts(prev => [...prev, { id, message, variant, duration }]);
  };

  const remove = (id: string) =>
    setToasts(prev => prev.filter(t => t.id !== id));

  const flash    = (msg: string) => add(msg, 'success');
  const flashErr = (msg: string) => add(msg, 'error');
  const flashWarn = (msg: string) => add(msg, 'warning');

  return { toasts, add, remove, flash, flashErr, flashWarn };
}
