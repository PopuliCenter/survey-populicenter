/**
 * useModalA11y.js
 *
 * Aksesibilitas dasar untuk modal/dialog:
 *  - Escape untuk menutup
 *  - Focus trap (Tab tidak keluar dari dialog)
 *  - Fokus awal ke elemen pertama, kembalikan fokus ke pemicu saat ditutup
 *  - Kunci scroll body selama terbuka
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {React.RefObject<HTMLElement>} containerRef - elemen pembungkus dialog
 */
import { useEffect } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function useModalA11y(open, onClose, containerRef) {
  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Fokus awal ke elemen pertama di dalam dialog
    const focusFirst = () => {
      const container = containerRef.current;
      if (!container) return;
      const focusables = container.querySelectorAll(FOCUSABLE);
      if (focusables.length > 0) focusables[0].focus();
      else container.focus();
    };
    // Tunggu satu frame agar konten sudah ter-render
    const raf = requestAnimationFrame(focusFirst);

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose, containerRef]);
}
