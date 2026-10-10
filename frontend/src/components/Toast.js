import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle, Info, Warning, WarningCircle, X } from '@phosphor-icons/react';
import { errorMessage } from '../utils/errorMessages';

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle, danger: WarningCircle, warning: Warning, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone, title, body) => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((t) => [...t.slice(-3), { id, tone, title, body }]);
      setTimeout(() => dismiss(id), tone === 'danger' ? 6000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (title, body) => push('success', title, body),
      info: (title, body) => push('info', title, body),
      warning: (title, body) => push('warning', title, body),
      error: (errOrTitle, body) => (typeof errOrTitle === 'string' ? push('danger', errOrTitle, body) : push('danger', 'Action failed', errorMessage(errOrTitle))),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} className={`toast tone-${t.tone}`} role={t.tone === 'danger' ? 'alert' : 'status'}>
              <Icon size={20} weight="fill" aria-hidden />
              <div className="grow">
                <strong>{t.title}</strong>
                {t.body && <div className="muted">{t.body}</div>}
              </div>
              <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
                <X size={14} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
