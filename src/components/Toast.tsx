import { useToastStore, type Toast } from '../store';

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);

  const colors: Record<string, string> = {
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colors[toast.type]} shadow-lg
        animate-[fadeInUp_0.3s_ease-out] cursor-pointer max-w-sm`}
      onClick={() => removeToast(toast.id)}
    >
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
