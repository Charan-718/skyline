import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { Button, IconButton } from './Button';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Dialog with focus trap, Esc to close, scroll lock and focus return. */
export function Modal({ open, onClose, title, description, children, footer, width, initialFocus }) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const node = ref.current;
    const target = (initialFocus && node.querySelector(initialFocus)) || node.querySelector('input, select, textarea') || node.querySelector(FOCUSABLE);
    target?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const items = [...node.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-root">
      <div className="modal-scrim" onClick={onClose} aria-hidden />
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} style={width ? { '--modal-w': `${width}px` } : undefined}>
        <div className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descId}>{description}</p>}
          </div>
          <IconButton icon={X} label="Close dialog" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', tone = 'primary', loading, extra }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={460}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="muted">{children}</div>
        {extra}
      </div>
    </Modal>
  );
}
