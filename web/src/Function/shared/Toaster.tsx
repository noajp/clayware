'use client';
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { AlertCircle, CheckCircle2, X } from '@/ui/icons';
import { ElementProgressMark } from './ElementProgressMark';
import { Button } from '@/ui/button';
import { FONT } from '@/shared/designTokens';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { clearToasts, dismissToast, getServerToasts, getToasts, subscribeToasts } from './toastStore';

/** The one place toasts from `notifyError` / `notifySuccess` appear. Mounted once in the root layout. */
export function Toaster() {
  const { t } = useI18n();
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
  useEffect(() => () => clearToasts(), []);
  // A quick-create card sits bottom-centre and stays open after a create, so
  // the "created" toast would land on its Create button. While one is open the
  // stack rises to just above it.
  const stackRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack || toasts.length === 0) return;
    const panel = document.querySelector('.quick-create-panel');
    stack.style.bottom = panel ? `${window.innerHeight - panel.getBoundingClientRect().top + 8}px` : '';
  }, [toasts]);
  return (
    <div
      role="status"
      aria-live="polite"
      ref={stackRef}
      className="pointer-events-none fixed bottom-[max(16px,env(safe-area-inset-bottom))] right-4 left-4 z-[100] flex flex-col items-end gap-2 sm:left-auto"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-fade-in pointer-events-auto flex w-full max-w-[380px] items-start gap-2 gloss-overlay rounded-lg px-3 py-2.5 text-popover-foreground"
        >
          {toast.kind === 'success'
            ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--status-success)]" />
            : <AlertCircle size={16} className="mt-0.5 shrink-0 text-[var(--status-danger)]" />}
          <div className="min-w-0 flex-1">
            <p className={`${FONT.base} font-medium`}>{toast.message}</p>
            {toast.detail && (
              <p className={`${FONT.sm} mt-1 flex min-w-0 items-center gap-1.5 break-words ${toast.kind === 'success' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {toast.elementStatus !== undefined && <ElementProgressMark status={toast.elementStatus ?? null} size={13} />}
                <span className="min-w-0 truncate">{toast.detail}</span>
              </p>
            )}
            {toast.action && (
              <button
                type="button"
                onClick={() => { toast.action?.run(); dismissToast(toast.id); }}
                className={`${FONT.sm} -ml-1.5 mt-1.5 inline-flex h-7 items-center rounded-md px-1.5 font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-subtle)]`}
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <Button variant="ghost" size="icon-xs" aria-label={t('Dismiss')} onClick={() => dismissToast(toast.id)}>
            <X size={14} />
          </Button>
        </div>
      ))}
    </div>
  );
}
