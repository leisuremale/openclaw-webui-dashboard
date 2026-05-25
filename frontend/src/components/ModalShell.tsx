import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../lib/utils';

interface ModalShellProps {
  onClose: () => void;
  /** Used by aria-labelledby — pass the id of an element inside `children`
   *  that names the dialog (typically the header). */
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal wrapper used by all hand-rolled modals.
 *
 *   - role="dialog" + aria-modal="true" so screen readers announce it.
 *   - Focus trapped inside via Tab / Shift-Tab. First focusable receives
 *     focus on mount; the element focused before opening is restored on
 *     close.
 *   - Escape closes.
 *   - Backdrop click closes; content click does not (via stopPropagation).
 */
export function ModalShell({ onClose, labelledBy, className, children }: ModalShellProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Focus management + ESC + focus trap.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = contentRef.current;
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? node).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !contentRef.current) return;
      const focusables = Array.from(
        contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !contentRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70"
      onClick={onClose}
      // Backdrop is just a click target; not interactive.
      role="presentation"
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn('outline-none', className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
