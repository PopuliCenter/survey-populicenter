import React from 'react';

/**
 * IconButton — tombol aksi ringkas berupa ikon dengan tooltip saat hover/fokus.
 *
 * Dipakai untuk aksi per-baris pada tabel/kartu (Edit, Hapus, Duplikasi, dll.)
 * agar baris tidak penuh teks. Label tetap tersedia bagi screen reader lewat
 * `aria-label`, dan muncul sebagai tooltip visual bagi pengguna awas.
 *
 * Tooltip memakai elemen styled (bukan atribut `title` bawaan) agar tampil
 * cepat & konsisten; diberi z-index tinggi supaya tidak tertutup baris lain.
 *
 * @param {object} props
 * @param {keyof typeof ICONS} props.icon - nama ikon dari peta ICONS
 * @param {string} props.label - teks tooltip + aria-label (wajib, deskriptif)
 * @param {() => void} props.onClick
 * @param {keyof typeof VARIANTS} [props.variant='default'] - skema warna
 * @param {boolean} [props.disabled]
 * @param {'up'|'down'} [props.tooltipPlacement='up']
 * @param {object} [props.rest] - atribut tambahan (aria-expanded, dll.)
 */

const VARIANTS = {
  default: 'text-gray-600 bg-gray-50 hover:bg-gray-100 focus:ring-gray-300',
  primary: 'text-primary-700 bg-primary-50 hover:bg-primary-100 focus:ring-primary-300',
  info: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 focus:ring-indigo-300',
  success: 'text-green-700 bg-green-50 hover:bg-green-100 focus:ring-green-300',
  warning: 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100 focus:ring-yellow-300',
  accent: 'text-purple-700 bg-purple-50 hover:bg-purple-100 focus:ring-purple-300',
  danger: 'text-red-700 bg-red-50 hover:bg-red-100 focus:ring-red-300',
};

// Ikon outline 24×24 (gaya Heroicons). Hanya bagian <path> agar IconButton
// membungkusnya dengan atribut <svg> yang seragam.
const ICONS = {
  quota: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  quotaHide: 'M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88',
  edit: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  builder: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.52-.63 1.23-.984 1.984-1.084m-4.48 4.114L6.75 21a2.652 2.652 0 01-3.75-3.75l4.62-3.77m4.48 4.114l-4.48-4.114m0 0L3 8.25 4.5 6.75 8.25 9l.917-1.114m0 0a4.5 4.5 0 016.336-6.336l-3.276 3.277a3.004 3.004 0 002.25 2.25l3.276-3.276a4.5 4.5 0 01-6.336 6.336',
  export: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  duplicate: 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75',
  activate: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  deactivate: 'M5.636 5.636a9 9 0 1012.728 0M12 3v9',
  trash: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.02-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  view: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  moveUp: 'M4.5 15.75l7.5-7.5 7.5 7.5',
  moveDown: 'M19.5 8.25l-7.5 7.5-7.5-7.5',
  unassign: 'M22 10.5h-6 M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z',
};

function IconButton({
  icon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
  tooltipPlacement = 'up',
  ...rest
}) {
  const pathData = ICONS[icon] || ICONS.edit;
  const tipPos =
    tooltipPlacement === 'down'
      ? 'top-full mt-1.5'
      : 'bottom-full mb-1.5';

  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.default}`}
        {...rest}
      >
        <svg
          className="w-[18px] h-[18px]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={pathData} />
        </svg>
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${tipPos} whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 z-30`}
      >
        {label}
      </span>
    </span>
  );
}

export default IconButton;
