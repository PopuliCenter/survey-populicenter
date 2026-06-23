import React from 'react';
import { PRIVACY_POLICY_URL, TERMS_URL, supportLink } from '../config/appLinks';

/**
 * AppFooterLinks — baris tautan Kebijakan Privasi · Syarat & Ketentuan ·
 * Hubungi Dukungan. Tautan yang belum diisi (kosong) otomatis disembunyikan.
 * Membuka di browser/sistem (Capacitor mengarahkan tautan eksternal ke luar).
 *
 * @param {{ className?: string, linkClassName?: string }} props
 */
function AppFooterLinks({ className = '', linkClassName = '' }) {
  const links = [
    { label: 'Kebijakan Privasi', href: PRIVACY_POLICY_URL },
    { label: 'Syarat & Ketentuan', href: TERMS_URL },
    { label: 'Hubungi Dukungan', href: supportLink() },
  ].filter((l) => l.href);

  if (links.length === 0) return null;

  return (
    <div className={className}>
      {links.map((l, i) => (
        <React.Fragment key={l.label}>
          {i > 0 && <span className="opacity-50" aria-hidden="true"> · </span>}
          <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
            {l.label}
          </a>
        </React.Fragment>
      ))}
    </div>
  );
}

export default AppFooterLinks;
