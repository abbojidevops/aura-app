// Accessible modal / bottom sheet: closes on Escape and backdrop click, locks page scroll, traps focus start.
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Sheet({ open, onClose, title, children, wide = false }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? ' sheet--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        <header className="sheet__head">
          <span className="sheet__title">{title}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}
