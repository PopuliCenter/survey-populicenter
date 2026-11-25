/**
 * AppUpdatePrompt — pemberitahuan pembaruan APK di Daftar Survei TPD.
 * Dijaga: banner bisa diketuk & ditunda; mode WAJIB tak bisa ditutup dan tetap
 * menawarkan kirim data tertunda; galat menawarkan halaman unduh resmi.
 */
import React from 'react';
import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../utils/appUpdate', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    startUpdate: vi.fn(),
    openReleasePage: vi.fn(),
    openInstallSettings: vi.fn().mockResolvedValue(),
    installDownloaded: vi.fn(),
  };
});
import { startUpdate, openReleasePage } from '../../../utils/appUpdate';
import AppUpdatePrompt from '../AppUpdatePrompt';

const release = {
  version_code: 29, version_name: '1.0.1', min_version_code: 27,
  notes: 'Perbaikan keamanan.', page_url: 'https://populicenter.org/x', apk_url: null, apk_sha256: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

test('available: banner → lembar detail → Perbarui menjalankan pembaruan', async () => {
  startUpdate.mockResolvedValue('opened_page');
  render(<AppUpdatePrompt state="available" release={release} />);

  fireEvent.click(screen.getByRole('button', { name: /pembaruan tersedia \(versi 1\.0\.1\)/i }));
  expect(screen.getByText('Perbaikan keamanan.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Perbarui sekarang' }));

  await waitFor(() => expect(startUpdate).toHaveBeenCalledWith(release, expect.any(Object)));
});

test('available: Nanti menyembunyikan banner', () => {
  render(<AppUpdatePrompt state="available" release={release} />);
  fireEvent.click(screen.getByRole('button', { name: /pembaruan tersedia/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Nanti' }));
  expect(screen.queryByRole('button', { name: /pembaruan tersedia/i })).not.toBeInTheDocument();
});

test('required: layar penuh tanpa Nanti; data tertunda bisa dikirim dulu', () => {
  const onSync = vi.fn();
  render(<AppUpdatePrompt state="required" release={release} pendingCount={3} onSync={onSync} />);

  expect(screen.getByRole('dialog', { name: /aplikasi perlu diperbarui/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nanti' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /kirim 3 data sekarang/i }));
  expect(onSync).toHaveBeenCalled();
});

test('required & offline: tombol perbarui menunggu sinyal', () => {
  render(<AppUpdatePrompt state="required" release={release} isOnline={false} />);
  expect(screen.getByRole('button', { name: /butuh sinyal/i })).toBeDisabled();
});

test('unduhan gagal → pesan jelas + tautan halaman resmi', async () => {
  startUpdate.mockRejectedValue(Object.assign(new Error('x'), { code: 'CHECKSUM_MISMATCH' }));
  render(<AppUpdatePrompt state="required" release={release} />);
  fireEvent.click(screen.getByRole('button', { name: 'Perbarui sekarang' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/tidak cocok/);
  fireEvent.click(screen.getByRole('button', { name: /halaman unduh resmi/i }));
  expect(openReleasePage).toHaveBeenCalledWith(release);
});

test('perlu izin pasang → tombol Pasang sekarang', async () => {
  startUpdate.mockResolvedValue('needs_permission');
  render(<AppUpdatePrompt state="required" release={release} />);
  fireEvent.click(screen.getByRole('button', { name: 'Perbarui sekarang' }));
  expect(await screen.findByRole('button', { name: 'Pasang sekarang' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Buka pengaturan' })).toBeInTheDocument();
});

test('state none → tidak merender apa pun', () => {
  const { container } = render(<AppUpdatePrompt state="none" release={release} />);
  expect(container).toBeEmptyDOMElement();
});
