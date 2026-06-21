import React, { useEffect, useState } from 'react';
import { subscribeToasts } from '../utils/toastBus';

const TONE_CLASS = {
  info: 'bg-gray-900 text-white',
  success: 'bg-green-600 text-white',
  warning: 'bg-amber-500 text-white',
  error: 'bg-red-600 text-white',
};

const TONE_ICON = {
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1.5 1.5 0 003.1 21h17.8a1.5 1.5 0 001.29-2.44l-8.48-14.7a1.5 1.5 0 00-2.42 0z',
  error: 'M10 14l4-4m0 4l-4-4m11 2a9 9 0 11-18 0 9 9 0 0118 0z',
};

/**
 * ToastContainer — menampilkan toast (pop-up sesaat) dari toastBus.
 * Dipasang sekali di root aplikasi. Mobile-friendly (muncul di bawah).
 */
function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = subscribeToasts((t) => {
      setToasts((prev) => [...prev, t]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, t.duration);
    });
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-[9999] flex flex-col items-center gap-2 px-4 pointer-events-none"
      aria-live="polite"
      role="status"
    >
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 max-w-md w-full sm:w-auto rounded-xl shadow-lg px-4 py-2.5 text-sm font-medium ${TONE_CLASS[t.tone] || TONE_CLASS.info}`}
          style={{ animation: 'toastIn 0.2s ease-out' }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={TONE_ICON[t.tone] || TONE_ICON.info} />
          </svg>
          <span className="leading-snug">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
