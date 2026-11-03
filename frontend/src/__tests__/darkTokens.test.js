/**
 * Guard token gelap. Membangun CSS lewat Tailwind sungguhan, karena kegagalan
 * yang dijaga di sini semuanya senyap: tidak ada error build, hanya tampilan salah.
 */
import { describe, test, expect } from 'vitest';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import config from '../../tailwind.config.js';

const build = async (raw) => (await postcss([tailwindcss({ ...config, content: [{ raw, extension: 'html' }] })])
  .process('@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined })).css;

const ALL = 'bg-white text-white border-white bg-black/50 bg-primary-600 hover:bg-primary-700 text-primary-600 '
  + 'border-gray-300 divide-gray-100 ring-2 focus:ring-primary-400 accent-primary-600 '
  + 'file:bg-gray-100 placeholder:text-gray-500 shadow shadow-lg bg-paper text-paper-ink';

const ALIASES = ['primary', 'accent', 'orange', 'gray', 'slate', 'green', 'emerald', 'amber', 'yellow',
  'red', 'rose', 'blue', 'indigo', 'violet', 'purple', 'sky', 'cyan', 'teal'];

describe('mekanisme token', () => {
  test('blok html.dark terbit walau kata dark tak ada di content (safelist)', async () => {
    expect(await build('bg-white')).toMatch(/html\.dark\s*\{/);
  });

  test('tidak ada <alpha-value> tersisa', async () => {
    expect(await build(ALL)).not.toContain('alpha-value');
  });

  test('warna ring bawaan tidak jatuh ke biru bawaan Tailwind', async () => {
    const css = await build('ring-2');
    expect(css).not.toContain('147 197 253');
    expect(css).toMatch(/--tw-ring-color:\s*rgb\(var\(--bd-info-500\) \/ 0\.5\)/);
  });

  test('text-white dan border-white tetap putih; bg-white mengikuti permukaan', async () => {
    const css = await build(ALL);
    expect(css).toMatch(/\.text-white\s*\{[^}]*rgb\(255 255 255/);
    expect(css).toMatch(/\.border-white\s*\{[^}]*rgb\(255 255 255/);
    expect(css).toMatch(/\.bg-white\s*\{[^}]*var\(--bg-white\)/);
    expect(css).toMatch(/\.bg-paper\s*\{[^}]*rgb\(255 255 255/);
  });

  test('semua variabel yang dirujuk didefinisikan', async () => {
    const css = await build(ALL);
    const defined = new Set([...css.matchAll(/(--(?:bg|fg|bd)-[\w-]+|--hairline|--shade):/g)].map((m) => m[1]));
    const used = [...css.matchAll(/var\((--(?:bg|fg|bd)-[\w-]+|--hairline|--shade)\)/g)].map((m) => m[1]);
    expect(used.filter((v) => !defined.has(v))).toEqual([]);
  });

  test('semua 18 alias + cream tertutup di latar, teks, dan garis', async () => {
    for (const a of ALIASES) {
      const css = await build(`bg-${a}-500 text-${a}-500 border-${a}-500 ring-${a}-500`);
      expect(css).toContain(`.bg-${a}-500`);
      expect(css).toMatch(new RegExp(`\\.bg-${a}-500\\s*\\{[^}]*var\\(--bg-`));
      expect(css).toMatch(new RegExp(`\\.text-${a}-500\\s*\\{[^}]*var\\(--fg-`));
      expect(css).toMatch(new RegExp(`\\.border-${a}-500\\s*\\{[^}]*var\\(--bd-`));
      expect(css).toMatch(new RegExp(`\\.ring-${a}-500\\s*\\{[^}]*var\\(--bd-`));
    }
    expect(await build('bg-cream')).toMatch(/\.bg-cream\s*\{[^}]*var\(--bg-ink-50\)/);
  });
});
