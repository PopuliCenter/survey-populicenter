/**
 * SetupReminders — satu kartu kesiapan HP; aksi menjalankan tindakan lalu
 * membaca ulang status; ✕ menunda.
 */
import React from 'react';
import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../utils/deviceSetup', async (orig) => {
  const actual = await orig();
  return { ...actual, getSetupStatus: vi.fn(), runReminderAction: vi.fn().mockResolvedValue() };
});
import { getSetupStatus, runReminderAction } from '../../../utils/deviceSetup';
import SetupReminders from '../SetupReminders';

const allOk = { notifications: true, location: true, locationService: true, camera: true, microphone: true };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

test('GPS mati → kartu GPS; Nyalakan menjalankan aksi lalu status dibaca ulang', async () => {
  getSetupStatus.mockResolvedValueOnce({ ...allOk, locationService: false, notifications: false })
    .mockResolvedValue(allOk);
  render(<SetupReminders />);

  expect(await screen.findByRole('region', { name: 'GPS mati' })).toBeInTheDocument();
  // Hanya SATU kartu walau notifikasi juga mati.
  expect(screen.queryByRole('region', { name: 'Nyalakan notifikasi' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Nyalakan' }));
  await waitFor(() => expect(runReminderAction).toHaveBeenCalledWith('gps'));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'GPS mati' })).not.toBeInTheDocument());
});

test('✕ menunda kartu teratas → kartu berikutnya tampil', async () => {
  getSetupStatus.mockResolvedValue({ ...allOk, notifications: false, camera: false });
  render(<SetupReminders />);

  fireEvent.click(await screen.findByRole('button', { name: /tutup pengingat: nyalakan notifikasi/i }));
  expect(await screen.findByRole('region', { name: /izinkan kamera/i })).toBeInTheDocument();
});

test('status tak terbaca (web/APK lama) → tanpa kartu', async () => {
  getSetupStatus.mockResolvedValue(null);
  const { container } = render(<SetupReminders />);
  await waitFor(() => expect(getSetupStatus).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

test('hidden (layar izin pertama-kali) → tanpa kartu', async () => {
  getSetupStatus.mockResolvedValue({ ...allOk, location: false });
  const { container } = render(<SetupReminders hidden />);
  await waitFor(() => expect(getSetupStatus).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
