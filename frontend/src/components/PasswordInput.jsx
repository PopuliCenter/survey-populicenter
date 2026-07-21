import React, { useState } from 'react';

/**
 * PasswordInput — input password dengan tombol show/hide (ikon mata).
 *
 * Pengganti langsung untuk `<input type="password" .../>`: teruskan prop yang
 * sama (id, value, onChange, className, autoComplete, aria-*, placeholder, dll.)
 * dan komponen menambahkan tombol toggle di kanan input. Ruang untuk tombol
 * dijamin lewat `pr-10` (menang atas `px-*` karena urutan layer Tailwind).
 *
 * @param {{ className?: string }} props  Sisanya diteruskan apa adanya ke <input>.
 */
export default function PasswordInput({ className = '', ...props }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-600 focus:outline-none focus:text-gray-600 rounded"
        aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
        aria-pressed={show}
        title={show ? 'Sembunyikan password' : 'Tampilkan password'}
      >
        {show ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}
