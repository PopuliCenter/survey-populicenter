/**
 * Unit Tests — components/Icon.jsx
 *
 * Ikon ini menggantikan emoji di seluruh aplikasi. Yang dijaga:
 *   - setiap nama menghasilkan SVG dengan path yang benar-benar ada
 *   - path tidak rusak/kosong (mudah terjadi saat menyalin path SVG)
 *   - default DEKORATIF (aria-hidden) — ikon di samping teks tidak boleh
 *     dibacakan ulang oleh pembaca layar
 *   - dengan `title` menjadi BERMAKNA (role=img + nama aksesibel)
 *   - nama tak dikenal tidak merusak halaman (render null, bukan melempar)
 */

import React from 'react';
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import Icon, { ICON_PATHS } from '../Icon.jsx';

const NAMES = Object.keys(ICON_PATHS);

describe('ICON_PATHS — kesehatan data path', () => {
  test('tidak kosong', () => {
    expect(NAMES.length).toBeGreaterThan(20);
  });

  test.each(NAMES)('path "%s" berupa perintah SVG yang wajar', (name) => {
    const v = ICON_PATHS[name];
    const paths = Array.isArray(v) ? v : [v];
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((d) => {
      expect(typeof d).toBe('string');
      expect(d.length).toBeGreaterThan(10);
      // Path SVG selalu dimulai perintah moveto.
      expect(d.trim().startsWith('M')).toBe(true);
      // Karakter di luar sintaks path menandakan salin-tempel yang rusak.
      expect(d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
    });
  });
});

describe('Icon — render', () => {
  test.each(NAMES)('nama "%s" merender <svg> berisi <path>', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const expected = Array.isArray(ICON_PATHS[name]) ? ICON_PATHS[name].length : 1;
    expect(container.querySelectorAll('path')).toHaveLength(expected);
  });

  test('memakai kanvas 24×24 dan garis (bukan isian) agar seragam', () => {
    const { container } = render(<Icon name="check" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  test('ukuran dapat ditimpa lewat className', () => {
    const { container } = render(<Icon name="check" className="w-8 h-8" />);
    expect(container.querySelector('svg')).toHaveClass('w-8', 'h-8');
  });

  test('nama tak dikenal → null, tidak melempar', () => {
    const { container } = render(<Icon name="tidak-ada-ikon-ini" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('Icon — aksesibilitas', () => {
  test('default DEKORATIF: disembunyikan dari pembaca layar', () => {
    const { container } = render(<Icon name="mic" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
  });

  test('dengan title menjadi BERMAKNA dan punya nama aksesibel', () => {
    const { getByRole } = render(<Icon name="mic" title="Rekaman audio" />);
    const svg = getByRole('img', { name: 'Rekaman audio' });
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  test('tidak pernah bisa difokus keyboard (bukan kontrol)', () => {
    const { container } = render(<Icon name="check" />);
    expect(container.querySelector('svg').getAttribute('focusable')).toBe('false');
  });
});
