/**
 * Toast.jsx
 *
 * Sistem notifikasi ringan untuk dashboard admin.
 * Toast muncul fixed di kanan-bawah (mengikuti viewport) sehingga feedback
 * aksi tetap terlihat walau pengguna sudah scroll jauh dari tombolnya.
 *
 * Pemakaian:
 *   1. Bungkus app dengan <ToastProvider> (sekali, di App.jsx).
 *   2. Di komponen: const toast = useToast(); toast.success('Tersimpan');
 *      Tersedia: toast.success(msg), toast.error(msg), toast.info(msg).
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const TONES = {
  success: { wrap: 'bg-green-600', icon: 'M5 13l4 4L19 7' },
  error: { wrap: 'bg-red-600', icon: 'M6 18L18 6M6 6l12 12' },
  info: { wrap: 'bg-primary-600', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, message, duration = 4000) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      if (duration > 0) {
        setTimeout(() => remove(id), duration);
      }
      return id;
    },
    [remove]
  );

  const api = useMemo(
    () => ({
      success: (msg, d) => push('success', msg, d),
      error: (msg, d) => push('error', msg, d),
      info: (msg, d) => push('info', msg, d),
      dismiss: remove,
    }),
    [push, remove]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm"
        role="region"
        aria-label="Notifikasi"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const tone = TONES[t.type] || TONES.info;
          return (
            <div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              className={`${tone.wrap} text-white rounded-lg shadow-lg px-4 py-3 flex items-start gap-3`}
            >
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tone.icon} />
              </svg>
              <span className="flex-1 text-sm">{t.message}</span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Tutup notifikasi"
                className="flex-shrink-0 text-white/80 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Akses API toast. Aman dipanggil walau provider belum terpasang
 * (mengembalikan no-op agar tidak crash di test/halaman tanpa provider).
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    const noop = () => {};
    return { success: noop, error: noop, info: noop, dismiss: noop };
  }
  return ctx;
}

export default ToastProvider;
