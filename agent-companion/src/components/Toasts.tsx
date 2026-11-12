import { AlertTriangle, CheckCircle2, Hand, X } from 'lucide-react';
import type { Toast, ToastKind } from '../hooks/useAgentAlerts';

const KIND: Record<ToastKind, { icon: typeof Hand; color: string; bg: string }> = {
  attention: { icon: Hand, color: '#c98a12', bg: '#fff6e0' },
  error: { icon: AlertTriangle, color: '#d6455d', bg: '#ffecef' },
  success: { icon: CheckCircle2, color: '#2f9e6b', bg: '#e8f8f0' },
};

export default function Toasts({
  toasts,
  onDismiss,
  onOpen,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  onOpen: (sessionId: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(340px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const k = KIND[t.kind];
        const Icon = k.icon;
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-white p-3 shadow-[0_8px_28px_rgba(120,90,140,0.28)]"
            style={{ background: k.bg }}
          >
            <span style={{ color: k.color }} className="mt-0.5 shrink-0">
              <Icon size={18} />
            </span>
            <button type="button" onClick={() => onOpen(t.sessionId)} className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left">
              <div className="text-[13px] font-semibold text-[#3d2f4f]">{t.title}</div>
              <div className="truncate text-[12.5px] text-[#6b5a7d]">{t.text}</div>
            </button>
            <button
              type="button"
              aria-label="ปิด"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-1 text-[#8b7a9b] hover:bg-white/70"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
